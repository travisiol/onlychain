/**
 * End to end, against the API and the chain — its own Hardhat node and its
 * own dev server, nothing shared with the one you are looking at:
 *
 *   node scripts/e2e.mjs            # node on 8767, server on 3767
 *
 * A fresh wallet opens a creator page, puts a price on the chain and posts
 * three ways (free / subscribers / pay-per-view). A fan sees the veil, then
 * approves $ONLY, subscribes onchain, and the same request now returns the
 * media; unlocks the pay-per-view post; tips; gets a paid file by message
 * and unlocks it. The creator's studio shows exactly what the chain says
 * they earned. Every "may not" is asserted as a 403, every "may" as a 200.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, maxUint256, parseEther, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "..");
const RPC_PORT = Number(process.env.E2E_RPC_PORT ?? 8767);
const PORT = Number(process.env.E2E_PORT ?? 3767);
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const BASE = `http://localhost:${PORT}`;

// Hardhat accounts #16 (creator) and #17 (fan) — untouched by the seed.
const creator = privateKeyToAccount("0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0");
const fan = privateKeyToAccount("0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd");
const localChain = { id: 31337, name: "local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain: localChain, transport: http(RPC) });

const children = [];
let passed = 0;
let failed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✔" : "✘"} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
function spawnBg(cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: process.platform === "win32", stdio: "ignore" });
  children.push(child);
  return child;
}
function run(cmd, args, cwd, env = {}) {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: process.platform === "win32", stdio: "inherit" });
    child.on("exit", (code) => res(code ?? 1));
  });
}
async function waitForHttp(url, tries = 300, post) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, post ? { method: "POST", headers: { "content-type": "application/json" }, body: post } : undefined);
      if (res.ok) return;
    } catch {
      /* not yet */
    }
    await sleep(400);
  }
  throw new Error(`nothing answered at ${url}`);
}

/** A signed-in HTTP client for one wallet: cookie jar + JSON helpers. */
class Client {
  constructor(account) {
    this.account = account;
    this.cookie = "";
    this.wallet = createWalletClient({ account, chain: localChain, transport: http(RPC) });
  }
  async req(path, init = {}) {
    const headers = { ...(init.headers ?? {}), ...(this.cookie ? { cookie: this.cookie } : {}) };
    if (init.json !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(init.json);
      init.method ??= "POST";
    }
    const res = await fetch(BASE + path, { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body, headers: res.headers };
  }
  async signIn() {
    const { body: n } = await this.req("/api/auth/nonce");
    const message = [
      `OnlyChain wants you to sign in with your wallet.`,
      ``,
      `This request will not trigger a transaction or cost any gas.`,
      `By signing you confirm you are 18 or older.`,
      ``,
      `Address: ${this.account.address}`,
      `Nonce: ${n.nonce}`,
      `Issued at: ${n.issuedAt}`,
    ].join("\n");
    const signature = await this.account.signMessage({ message });
    return this.req("/api/auth/verify", { json: { address: this.account.address, nonce: n.nonce, issuedAt: n.issuedAt, signature } });
  }
  async tx(request) {
    const hash = await this.wallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
    await this.req("/api/chain/sync", { json: { txHash: hash } });
    return hash;
  }
  async upload(bytes, type, name) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), name);
    return this.req("/api/upload", { method: "POST", body: form });
  }
}

// a 1×1 PNG, enough for an upload
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

async function main() {
  console.log("ONLYCHAIN — end to end (API + chain)");
  console.log("· hardhat node");
  spawnBg("npx", ["hardhat", "node", "--port", String(RPC_PORT)], join(ROOT, "chain"));
  await waitForHttp(RPC, 150, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }));
  console.log("· seed");
  const seedOut = join(mkdtempSync(join(tmpdir(), "oc-e2e-")), "local.json");
  const code = await run("npx", ["hardhat", "run", "scripts/seed-local.ts", "--network", "localhost"], join(ROOT, "chain"), { HARDHAT_LOCALHOST_URL: RPC, SEED_OUT: seedOut });
  if (code !== 0) throw new Error("seed failed");
  const local = JSON.parse(readFileSync(seedOut, "utf8"));
  const HUB = local.hub;
  const TOKEN = local.token;

  const dbDir = mkdtempSync(join(tmpdir(), "oc-e2e-db-"));
  console.log(`· server on :${PORT}`);
  spawnBg("npx", ["next", "dev", "--port", String(PORT)], ROOT, {
    ONLYCHAIN_CHAIN_ID: "31337",
    ONLYCHAIN_RPC_URL: RPC,
    ONLYCHAIN_HUB: HUB,
    ONLYCHAIN_TOKEN: TOKEN,
    NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID: "31337",
    NEXT_PUBLIC_ONLYCHAIN_RPC_URL: RPC,
    NEXT_PUBLIC_ONLYCHAIN_HUB: HUB,
    NEXT_PUBLIC_ONLYCHAIN_TOKEN: TOKEN,
    NEXT_PUBLIC_ONLYCHAIN_CURVE: local.curve,
    ONLYCHAIN_DB_PATH: join(dbDir, "e2e.db"),
    ONLYCHAIN_UPLOAD_DIR: join(dbDir, "uploads"),
    SESSION_SECRET: "e2e-secret-e2e-secret-e2e",
    NEXT_DIST_DIR: ".next-e2e",
  });
  await waitForHttp(`${BASE}/api/health`, 400);

  const { onlyChainAbi, erc20Abi } = await import("../src/lib/abi/onlychain.ts");
  const hub = { address: HUB, abi: onlyChainAbi };
  const token = { address: TOKEN, abi: erc20Abi };

  // ---- health --------------------------------------------------------------------
  console.log("\nhealth");
  const anon = new Client(fan);
  const health = (await anon.req("/api/health")).body;
  check("the server reads the hub's immutables from the chain", health.hub?.feeBps === 1000 && health.hub?.tokenSymbol === "ONLY" && health.chain.reachable, health);
  check("sample creators are seeded", health.counts.creators === 10 && health.counts.posts === 80, health.counts);

  // ---- auth ----------------------------------------------------------------------
  console.log("\nsign-in");
  const c = new Client(creator);
  const f = new Client(fan);
  check("an unsigned wallet gets a 401 on its feed", (await anon.req("/api/feed")).status === 401);
  const bad = await c.req("/api/auth/verify", { json: { address: creator.address, nonce: "deadbeef", issuedAt: new Date().toISOString(), signature: "0x" + "11".repeat(65) } });
  check("a made-up nonce is refused", bad.status === 401, bad.body);
  const si = await c.signIn();
  check("the creator signs in with one signature", si.status === 200 && si.body.session?.address === creator.address, si.body);
  const me = await c.req("/api/auth/me");
  check("the cookie carries the session and a fresh profile", me.body.session?.address === creator.address && me.body.profile && me.body.profile.isCreator === false, me.body);
  const fs = await f.signIn();
  check("the fan signs in too", fs.status === 200, fs.body);

  // ---- becoming a creator ------------------------------------------------------------
  console.log("\ncreator setup");
  const noPost = await c.req("/api/posts", { json: { text: "hello" } });
  check("posting before opening a page is refused", noPost.status === 403, noPost.body);
  const badHandle = await c.req("/api/me", { method: "PATCH", json: { handle: "home" } });
  check("a reserved handle is refused", badHandle.status === 400, badHandle.body);
  const taken = await c.req("/api/me", { method: "PATCH", json: { handle: "lunavega" } });
  check("a taken handle is refused", taken.status === 400, taken.body);
  const opened = await c.req("/api/me", { method: "PATCH", json: { handle: "Nova_Reyes", displayName: "Nova Reyes", bio: "Illustration and process, weekly.", category: "Art", isCreator: true } });
  check("handle + name open the page (handle lowercased)", opened.status === 200 && opened.body.profile.isCreator && opened.body.profile.handle === "nova_reyes", opened.body);

  const page0 = await anon.req("/api/creators/nova_reyes");
  check("the new page is public and has no plan yet", page0.status === 200 && page0.body.plan === null, page0.body);

  const price = parseEther("20");
  await c.tx({ ...hub, functionName: "setPlan", args: [price, true, 1000, 2000, 3000, 7] });
  const page1 = await anon.req("/api/creators/nova_reyes");
  check("setPlan onchain → the page shows 20 ONLY / month, open", page1.body.plan?.monthlyPrice === price.toString() && page1.body.plan?.open === true, page1.body.plan);

  // ---- posts ---------------------------------------------------------------------------
  console.log("\nposts");
  const up = await c.upload(PNG, "image/png", "art.png");
  check("an upload returns a media id", up.status === 200 && up.body.media?.id, up.body);
  const badUp = await c.upload(Buffer.from("<svg/>"), "image/svg+xml", "x.svg");
  check("an SVG upload is refused (scriptable)", badUp.status === 400, badUp.body);

  const pFree = (await c.req("/api/posts", { json: { text: "Open to everyone.", access: "free" } })).body.post;
  const up2 = await c.upload(PNG, "image/png", "art2.png");
  const pSubs = (await c.req("/api/posts", { json: { text: "For subscribers.", access: "subscribers", mediaId: up2.body.media.id } })).body.post;
  const up3 = await c.upload(PNG, "image/png", "art3.png");
  const pPpv = (await c.req("/api/posts", { json: { text: "Pay per view.", access: "ppv", price: parseEther("7").toString(), mediaId: up3.body.media.id } })).body.post;
  check("three posts created", pFree?.id && pSubs?.id && pPpv?.id, { pFree, pSubs, pPpv });
  const noPrice = await c.req("/api/posts", { json: { text: "x", access: "ppv", price: "0" } });
  check("a pay-per-view post without a price is refused", noPrice.status === 400);
  const stolen = await f.req("/api/posts", { json: { text: "x", mediaId: up3.body.media.id, access: "free" } });
  check("attaching someone else's upload is refused", stolen.status === 403 || stolen.status === 400, stolen.body);

  const fanView = (await f.req("/api/creators/nova_reyes")).body;
  const byId = Object.fromEntries(fanView.posts.map((p) => [p.id, p]));
  check("the fan sees the free post open", byId[pFree.id]?.unlocked === true);
  check("the fan sees the subscribers post locked, with no media URL", byId[pSubs.id]?.unlocked === false && byId[pSubs.id]?.media.length === 0 && byId[pSubs.id]?.mediaCount === 1, byId[pSubs.id]);
  check("the fan sees the PPV post locked at 7 ONLY", byId[pPpv.id]?.unlocked === false && byId[pPpv.id]?.price === parseEther("7").toString(), byId[pPpv.id]);
  const media403 = await f.req(`/api/media/${up2.body.media.id}`);
  check("the locked file itself answers 403", media403.status === 403, media403.status);
  const mediaAnon = await anon.req(`/api/media/${up2.body.media.id}`, { headers: { cookie: "" } });
  check("…and 403 to a stranger", mediaAnon.status === 403);
  const ownerMedia = await c.req(`/api/media/${up2.body.media.id}`);
  check("the creator streams their own file (200, image/png)", ownerMedia.status === 200 && ownerMedia.headers.get("content-type") === "image/png");
  const likeLocked = await f.req(`/api/posts/${pSubs.id}/like`, { json: {} });
  check("liking a locked post is refused", likeLocked.status === 403);

  // ---- subscribe onchain -----------------------------------------------------------------
  console.log("\nsubscribe");
  const feed0 = (await f.req("/api/feed")).body;
  check("the fan's feed is empty before subscribing", feed0.posts.length === 0 && feed0.following === 0 && feed0.suggestions.length > 0, { n: feed0.posts.length });
  const before = await pub.readContract({ ...token, functionName: "balanceOf", args: [creator.address] });
  await f.tx({ ...token, functionName: "approve", args: [HUB, maxUint256] });
  const subHash = await f.tx({ ...hub, functionName: "subscribe", args: [creator.address, 3] });
  const after = await pub.readContract({ ...token, functionName: "balanceOf", args: [creator.address] });
  check("3 months at 20 ONLY with the 10 % bundle = 54 gross: the creator received 48.6 ONLY (90 %) in the same tx", after - before === parseEther("48.6"), (after - before).toString());
  const hubBal = await pub.readContract({ ...token, functionName: "balanceOf", args: [HUB] });
  check("the hub holds nothing", hubBal === 0n);

  const fanView2 = (await f.req("/api/creators/nova_reyes")).body;
  const byId2 = Object.fromEntries(fanView2.posts.map((p) => [p.id, p]));
  check("the page now says the fan is subscribed for ~90 days", fanView2.viewerUntil > Date.now() / 1000 + 89 * 86400, fanView2.viewerUntil);
  check("the subscribers post is open with its media URL", byId2[pSubs.id]?.unlocked === true && typeof byId2[pSubs.id]?.media[0]?.url === "string", byId2[pSubs.id]);
  check("the PPV post stays locked for a subscriber", byId2[pPpv.id]?.unlocked === false);
  const media200 = await f.req(`/api/media/${up2.body.media.id}`);
  check("the file now streams (200)", media200.status === 200);
  const feed1 = (await f.req("/api/feed")).body;
  check("the fan's feed shows the creator's posts, following = 1", feed1.following === 1 && feed1.posts.some((p) => p.id === pFree.id), { following: feed1.following, n: feed1.posts.length });
  const subs = (await f.req("/api/subscriptions")).body;
  check("subscriptions lists it active with the chain's end date and the payment", subs.subscriptions[0]?.creator.handle === "nova_reyes" && subs.subscriptions[0]?.active && subs.history.some((h) => h.txHash === subHash), subs);
  const like = await f.req(`/api/posts/${pSubs.id}/like`, { json: {} });
  check("the fan can now like it", like.status === 200 && like.body.liked === true && like.body.likes === 1, like.body);
  const comment = await f.req(`/api/posts/${pSubs.id}/comments`, { json: { text: "Worth every ONLY." } });
  check("…and comment", comment.status === 201 && comment.body.comment.author.address === fan.address, comment.body);
  const stats = (await anon.req("/api/creators/nova_reyes")).body.stats;
  check("the page counts 1 active subscriber (chain-verified)", stats.subscribers === 1, stats);

  // ---- pay per view ----------------------------------------------------------------------
  console.log("\nunlock");
  const contentId = keccak256(toBytes(`post:${pPpv.id}`));
  const tooLittle = await (async () => {
    await f.tx({ ...hub, functionName: "unlock", args: [creator.address, contentId, parseEther("3")] });
    const v = (await f.req(`/api/posts/${pPpv.id}`)).body.post;
    return v.unlocked;
  })();
  check("paying 3 of 7 ONLY does not open it", tooLittle === false);
  await f.tx({ ...hub, functionName: "unlock", args: [creator.address, contentId, parseEther("4")] });
  const ppvNow = (await f.req(`/api/posts/${pPpv.id}`)).body.post;
  check("topping up to 7 ONLY opens it (amounts accumulate)", ppvNow.unlocked === true && Boolean(ppvNow.media[0]?.url), ppvNow);
  const paid = await pub.readContract({ ...hub, functionName: "unlockedAmount", args: [fan.address, contentId] });
  check("the chain records 7 ONLY against the fan for that content", paid === parseEther("7"));

  // ---- tip -------------------------------------------------------------------------------
  console.log("\ntip");
  await f.tx({ ...hub, functionName: "tip", args: [creator.address, parseEther("5"), keccak256(toBytes(`post:${pFree.id}`))] });
  const earned = await pub.readContract({ ...hub, functionName: "earned", args: [creator.address] });
  check("earned = 48.6 + 6.3 + 4.5 = 59.4 ONLY net", earned === parseEther("59.4"), earned.toString());
  const studio = (await c.req("/api/studio")).body;
  check("the studio shows exactly that, 1 subscriber, 3 posts and the 4 payments", studio.earned === earned.toString() && studio.stats.subscribers === 1 && studio.stats.posts === 3 && studio.activity.length === 4, { earned: studio.earned, stats: studio.stats, activity: studio.activity.length });
  const notifs = (await c.req("/api/notifications")).body;
  check("notifications: the subscription, two unlocks, the tip, a like and a comment", notifs.notifications.filter((n) => n.kind === "subscribed").length === 1 && notifs.notifications.filter((n) => n.kind === "unlocked").length === 2 && notifs.notifications.filter((n) => n.kind === "tipped").length === 1 && notifs.notifications.some((n) => n.kind === "like") && notifs.notifications.some((n) => n.kind === "comment"), notifs.notifications.map((n) => n.kind));
  const peek = (await c.req("/api/notifications?peek=1")).body;
  check("after reading, nothing is unseen", peek.unseen === 0, peek);

  // ---- messages with a paid file -----------------------------------------------------------
  console.log("\nmessages");
  const hello = await f.req(`/api/messages/nova_reyes`, { json: { text: "Hi! Loved the last piece." } });
  check("the fan writes to the creator", hello.status === 201, hello.body);
  const fanPaid = await f.req(`/api/messages/nova_reyes`, { json: { text: "x", mediaId: up3.body.media.id, price: "1" } });
  check("a fan cannot send a paid message", fanPaid.status === 403 || fanPaid.status === 400, fanPaid.body);
  const up4 = await c.upload(PNG, "image/png", "dm.png");
  const paidMsg = await c.req(`/api/messages/${fan.address}`, { json: { text: "Here is the full-res file.", mediaId: up4.body.media.id, price: parseEther("2").toString() } });
  check("the creator sends a paid file", paidMsg.status === 201 && paidMsg.body.message.price === parseEther("2").toString(), paidMsg.body);
  const thread = (await f.req(`/api/messages/nova_reyes`)).body;
  const locked = thread.messages.find((m) => m.id === paidMsg.body.message.id);
  check("the fan sees it locked, no media URL", locked && locked.unlocked === false && locked.media === null, locked);
  check("the fan cannot fetch the file", (await f.req(`/api/media/${up4.body.media.id}`)).status === 403);
  await f.tx({ ...hub, functionName: "unlock", args: [creator.address, keccak256(toBytes(`msg:${paidMsg.body.message.id}`)), parseEther("2")] });
  const thread2 = (await f.req(`/api/messages/nova_reyes`)).body;
  const opened2 = thread2.messages.find((m) => m.id === paidMsg.body.message.id);
  check("after unlocking onchain the file is there", opened2?.unlocked === true && opened2.media?.url, opened2);
  check("…and streams (200)", (await f.req(`/api/media/${up4.body.media.id}`)).status === 200);
  const convos = (await c.req("/api/messages")).body;
  check("the creator's inbox lists the fan", convos.conversations.some((x) => x.peer.address === fan.address), convos);
  const stranger = new Client(privateKeyToAccount("0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0"));
  await stranger.signIn();
  const trialPage = (await stranger.req("/api/creators/nova_reyes")).body;
  check("a wallet that never subscribed is offered the 7-day trial", trialPage.viewerTrial === true && trialPage.plan.trialDays === 7, { trial: trialPage.viewerTrial, plan: trialPage.plan });
  await stranger.tx({ ...hub, functionName: "startTrial", args: [creator.address] });
  const trialPage2 = (await stranger.req("/api/creators/nova_reyes")).body;
  const byId3 = Object.fromEntries(trialPage2.posts.map((p) => [p.id, p]));
  check("after startTrial the subscribers post is open and the trial is spent", byId3[pSubs.id]?.unlocked === true && trialPage2.viewerTrial === false && trialPage2.viewerUntil > Date.now() / 1000 + 6 * 86400, { unlocked: byId3[pSubs.id]?.unlocked, trial: trialPage2.viewerTrial });
  const fanTrial = (await f.req("/api/creators/nova_reyes")).body;
  check("a fan who already subscribed is not offered the trial", fanTrial.viewerTrial === false);
  const cold = await stranger.req(`/api/messages/${fan.address}`, { json: { text: "hey" } });
  check("a stranger cannot message a fan (not a creator, no thread)", cold.status === 403, cold.body);

  // ---- the OnlyFans extras: several files, bookmarks, pin, edit, schedule, comments, blocks, reports ----
  console.log("\nextras");
  const upA = await c.upload(PNG, "image/png", "a.png");
  const upB = await c.upload(PNG, "image/png", "b.png");
  const upC = await c.upload(PNG, "image/png", "c.png");
  const multi = (await c.req("/api/posts", { json: { text: "Three files, one post.", access: "subscribers", mediaIds: [upA.body.media.id, upB.body.media.id, upC.body.media.id] } })).body.post;
  check("a post carries several files in order", multi?.mediaCount === 3 && multi.media.length === 3 && multi.media[1].url.endsWith(upB.body.media.id), multi);
  // account #14 (a sample fan the seed never subscribed) — the stranger above took the trial and is subscribed now
  const outsider = new Client(privateKeyToAccount("0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa"));
  await outsider.signIn();
  const multiLocked = (await outsider.req(`/api/posts/${multi.id}`)).body.post;
  check("locked for an outsider: the count is known, no URL leaves", multiLocked.mediaCount === 3 && multiLocked.media.length === 0 && multiLocked.unlocked === false, multiLocked);
  check("each of the three files answers 403 to the outsider", (await Promise.all([upA, upB, upC].map((u) => outsider.req(`/api/media/${u.body.media.id}`)))).every((r) => r.status === 403));

  const pinned = await c.req(`/api/posts/${multi.id}`, { method: "PATCH", json: { pinned: true } });
  const edited = await c.req(`/api/posts/${multi.id}`, { method: "PATCH", json: { text: "Three files, one post — edited." } });
  check("the creator pins and edits the post", pinned.body.post?.pinned === true && edited.body.post?.text.endsWith("edited."), { pinned: pinned.body, edited: edited.body });
  const pageOrder = (await anon.req("/api/creators/nova_reyes")).body.posts;
  check("the pinned post comes first on the page", pageOrder[0]?.id === multi.id, pageOrder.map((p) => p.id));
  const notMinePatch = await f.req(`/api/posts/${multi.id}`, { method: "PATCH", json: { pinned: false } });
  check("a fan cannot pin someone else's post", notMinePatch.status === 404);

  const later = Date.now() + 3600_000;
  const scheduled = (await c.req("/api/posts", { json: { text: "Tomorrow's post.", access: "free", publishAt: later } })).body.post;
  const pageNow = (await anon.req("/api/creators/nova_reyes")).body.posts.map((p) => p.id);
  const studioNow = (await c.req("/api/studio")).body.posts;
  check("a scheduled post is invisible on the page and in feeds, listed in Studio as scheduled", scheduled?.scheduled === true && !pageNow.includes(scheduled.id) && studioNow.some((p) => p.id === scheduled.id && p.scheduled), { scheduled, pageNow });

  const bm = await f.req(`/api/posts/${multi.id}/bookmark`, { json: {} });
  const collections = (await f.req("/api/collections")).body.posts;
  check("the fan saves the post and finds it in Collections (open, since subscribed)", bm.body.bookmarked === true && collections.some((p) => p.id === multi.id && p.unlocked), { bm: bm.body, n: collections.length });
  await f.req(`/api/posts/${multi.id}/bookmark`, { json: { on: false } });
  check("…and can unsave it", !(await f.req("/api/collections")).body.posts.some((p) => p.id === multi.id));

  const cm = await f.req(`/api/posts/${multi.id}/comments`, { json: { text: "Lovely set." } });
  const rmByStranger = await outsider.req(`/api/comments/${cm.body.comment.id}`, { method: "DELETE" });
  const rmByCreator = await c.req(`/api/comments/${cm.body.comment.id}`, { method: "DELETE" });
  check("a comment can be removed by the creator, not by a stranger", rmByStranger.status === 403 && rmByCreator.status === 200, { s: rmByStranger.status, c: rmByCreator.status });

  const rep = await f.req("/api/report", { json: { kind: "post", target: multi.id, reason: "test report" } });
  const repBad = await f.req("/api/report", { json: { kind: "post", target: "nope", reason: "x" } });
  check("a report is stored; reporting nothing is refused", rep.status === 201 && repBad.status === 404, { rep: rep.status, repBad: repBad.status });

  await c.req("/api/blocks", { json: { address: fan.address, on: true } });
  const blockedComment = await f.req(`/api/posts/${multi.id}/comments`, { json: { text: "still here?" } });
  const blockedDm = await f.req(`/api/messages/nova_reyes`, { json: { text: "hello?" } });
  const stillOpen = (await f.req(`/api/posts/${multi.id}`)).body.post;
  const blockList = (await c.req("/api/blocks")).body.blocked;
  check("a blocked fan cannot comment or DM, but what the chain granted stays open", blockedComment.status === 403 && blockedDm.status === 403 && stillOpen.unlocked === true && blockList.some((b) => b.address === fan.address), { blockedComment: blockedComment.status, blockedDm: blockedDm.status, open: stillOpen.unlocked });
  await c.req("/api/blocks", { json: { address: fan.address, on: false } });
  check("unblocked, the fan can DM again", (await f.req(`/api/messages/nova_reyes`, { json: { text: "back" } })).status === 201);

  // welcome message + broadcast + statements + vault
  await c.req("/api/me", { method: "PATCH", json: { welcomeMessage: "Welcome aboard!" } });
  const newcomer = new Client(privateKeyToAccount("0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e"));
  await newcomer.signIn();
  await newcomer.tx({ ...token, functionName: "approve", args: [HUB, maxUint256] });
  await newcomer.tx({ ...hub, functionName: "subscribe", args: [creator.address, 1] });
  const welcomeThread = (await newcomer.req("/api/messages/nova_reyes")).body.messages;
  check("a new subscriber receives the welcome message as a DM from the creator", welcomeThread.some((m) => m.text === "Welcome aboard!" && m.from === creator.address), welcomeThread);
  const bc = await c.req("/api/messages/broadcast", { json: { text: "New set is up!" } });
  const fanThread = (await f.req("/api/messages/nova_reyes")).body.messages;
  const newcomerThread = (await newcomer.req("/api/messages/nova_reyes")).body.messages;
  check("a broadcast reaches every active subscriber", bc.body.sent >= 3 && fanThread.some((m) => m.text === "New set is up!") && newcomerThread.some((m) => m.text === "New set is up!"), { sent: bc.body.sent });
  const bcByFan = await f.req("/api/messages/broadcast", { json: { text: "x" } });
  check("a fan cannot broadcast", bcByFan.status === 403);
  const studio2 = (await c.req("/api/studio")).body;
  check("statements: one month line whose net equals the studio's earned", studio2.statements.length >= 1 && studio2.statements.reduce((acc, m) => acc + BigInt(m.net), 0n).toString() === studio2.earned, { statements: studio2.statements, earned: studio2.earned });
  const vaultList = (await c.req("/api/vault")).body.media;
  check("the vault lists the creator's uploads with where they are used", vaultList.length >= 7 && vaultList.some((m) => m.usedInPosts === 1) && vaultList.some((m) => m.usedInMessages === 1), { n: vaultList.length });

  // ---- operator desk (open mode on the local chain) + rate limits ----------------------------------
  console.log("\noperator");
  const desk = (await outsider.req("/api/ops")).body;
  check("on the local chain any signed-in wallet reaches /api/ops (open mode, said so)", desk.open === true && desk.counts.openReports >= 1 && desk.reports.some((r) => r.target === multi.id && r.about.href === `/p/${multi.id}`), { open: desk.open, counts: desk.counts });
  const verified = await outsider.req("/api/ops", { json: { action: "verify", target: "nova_reyes" } });
  check("the operator grants the verified badge", verified.body.profile?.verified === true, verified.body);
  await outsider.req("/api/ops", { json: { action: "resolve", target: rep.body.id } });
  const resolved = (await outsider.req("/api/ops?reports=all")).body.reports.find((r) => r.id === rep.body.id);
  check("…and resolves the report", resolved?.status === "resolved", resolved);
  await outsider.req("/api/ops", { json: { action: "suspend", target: creator.address } });
  const gone = await anon.req("/api/creators/nova_reyes", { headers: { cookie: "" } }); // operators still see it; visitors do not
  const cannotPost = await c.req("/api/posts", { json: { text: "still here", access: "free" } });
  const explore = (await outsider.req("/api/creators")).body.creators;
  check("a suspended creator's page is unavailable, they cannot post, and Explore drops them", gone.status === 404 && cannotPost.status === 403 && !explore.some((x) => x.address === creator.address), { gone: gone.status, cannotPost: cannotPost.status });
  await outsider.req("/api/ops", { json: { action: "unsuspend", target: creator.address } });
  check("unsuspended, the page is back", (await anon.req("/api/creators/nova_reyes", { headers: { cookie: "" } })).status === 200);
  let limited = 0;
  for (let i = 0; i < 22; i++) {
    const r = await outsider.req("/api/report", { json: { kind: "post", target: multi.id, reason: `spam ${i}` } });
    if (r.status === 429) limited++;
  }
  check("the 21st report in an hour is rate-limited (429)", limited >= 1, { limited });

  // ---- delete ------------------------------------------------------------------------------
  console.log("\ndelete");
  const notMine = await f.req(`/api/posts/${pFree.id}`, { method: "DELETE" });
  check("deleting someone else's post is refused", notMine.status === 404);
  const del = await c.req(`/api/posts/${pFree.id}`, { method: "DELETE" });
  check("the creator deletes their post", del.status === 200 && (await anon.req(`/api/posts/${pFree.id}`)).status === 404);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children) {
      try {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill();
      } catch {
        /* gone */
      }
    }
    setTimeout(() => process.exit(), 1500);
  });
