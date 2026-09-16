/**
 * The real screens, driven for real: headless Chrome with a stub wallet (an
 * EIP-1193 provider whose signatures and transactions are produced by a tiny
 * local daemon holding Hardhat test keys), against a dev server of its own
 * pointed at a seeded Hardhat node of its own.
 *
 *   node scripts/ui-e2e.mjs        # node on 8768, server on 3768, drives, captures
 *
 * A fan connects on the landing page (one signature), lands on Home, opens
 * Luna's page, subscribes for a month through the dialog (approve + pay in
 * the stub), sees the veil lift, tips, unlocks a pay-per-view post. A second
 * wallet opens a creator page from Studio, puts a price on the chain and
 * posts. Every screen is captured to docs/captures/ui-*.png.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/captures");
mkdirSync(OUT, { recursive: true });
const RPC_PORT = 8768;
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const PORT = 3768;
const BASE = `http://localhost:${PORT}`;
const DAEMON_PORT = 9768;
const CDP_PORT = 9349;

// Hardhat #15 (the fan, untouched by the seed) and #18 (the new creator).
const fan = privateKeyToAccount("0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61");
const maker = privateKeyToAccount("0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0");
const LUNA = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const localChain = { id: 31337, name: "local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain: localChain, transport: http(RPC) });

let current = fan;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✔" : "✘"} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

// ---- the wallet daemon: signs and sends for whichever account is "current" ----
const daemon = createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : {};
  const reply = (obj) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.url === "/account") return reply({ result: current.address });
    if (req.url === "/sign") return reply({ result: await current.signMessage({ message: { raw: data.message } }) });
    if (req.url === "/send") {
      const tx = data.tx;
      const wallet = createWalletClient({ account: current, chain: localChain, transport: http(RPC) });
      const hash = await wallet.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data ?? undefined });
      return reply({ result: hash });
    }
    reply({ error: `unknown ${req.url}` });
  } catch (err) {
    reply({ error: err.shortMessage ?? err.message });
  }
});

const STUB = `(() => {
  const DAEMON = 'http://127.0.0.1:${DAEMON_PORT}';
  const RPC = '${RPC}';
  let id = 0;
  const listeners = {};
  async function rpc(method, params) {
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    const j = await res.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
    return j.result;
  }
  async function daemon(path, body) {
    const res = await fetch(DAEMON + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const j = await res.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  }
  const provider = {
    isMetaMask: true,
    isStub: true,
    async request({ method, params }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': return [await daemon('/account')];
        case 'eth_chainId': return '0x7a69';
        case 'net_version': return '31337';
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain': return null;
        case 'wallet_requestPermissions':
        case 'wallet_getPermissions': return [{ parentCapability: 'eth_accounts' }];
        case 'personal_sign': return daemon('/sign', { message: params[0], address: params[1] });
        case 'eth_sendTransaction': return daemon('/send', { tx: params[0] });
        case 'wallet_getCapabilities': { const e = new Error('unsupported'); e.code = 4200; throw e; }
        default: return rpc(method, params ?? []);
      }
    },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return provider; },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); return provider; },
    removeAllListeners() { return provider; },
  };
  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: true });
  const info = { uuid: 'e2e00000-0000-4000-8000-000000000003', name: 'Stub Wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'test.stub' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
  try { localStorage.setItem('onlychain:age-ok', '1'); } catch {}
})();`;

// ---- CDP ----
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.logs.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.logs.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
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

function spawnBg(cmd, args, cwd, env = {}, shell = process.platform === "win32") {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell, stdio: "ignore" });
  children.push(child);
  return child;
}

function run(cmd, args, cwd, env = {}) {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: process.platform === "win32", stdio: "ignore" });
    child.on("exit", (code) => res(code ?? 1));
  });
}

class Page {
  constructor(cdp, ws, targetId) {
    this.cdp = cdp;
    this.ws = ws;
    this.targetId = targetId;
  }
  static async open({ fresh = false } = {}) {
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", rej);
    });
    const cdp = new Cdp(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // a new wallet means a new visitor: drop the previous wallet's session cookie
    if (fresh) await cdp.send("Network.clearBrowserCookies");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    return new Page(cdp, ws, target.id);
  }
  async goto(path) {
    await this.cdp.send("Page.navigate", { url: BASE + path });
    await sleep(2500);
  }
  async eval(expression) {
    const { result, exceptionDetails } = await this.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }
  async waitFor(expression, timeoutMs = 30_000, label = expression) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await this.eval(expression)) return true;
      } catch {
        /* retry */
      }
      await sleep(300);
    }
    const text = await this.text().catch(() => "");
    await this.shot("ui-debug-timeout").catch(() => {});
    const NL = String.fromCharCode(10);
    throw new Error(`timed out waiting for: ${label}${NL}--- page text ---${NL}${text.slice(0, 1500)}${NL}--- console ---${NL}${this.cdp.logs.slice(-8).join(NL)}`);
  }
  text() {
    return this.eval("document.body.innerText");
  }
  async click(text, tag = "button, a") {
    const ok = await this.eval(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)})).filter((e) => !e.disabled && e.getClientRects().length > 0);
      const el = els.find((e) => e.textContent.trim() === ${JSON.stringify(text)}) ?? els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})) ?? els.find((e) => e.textContent.includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`no clickable "${text}"`);
    await sleep(400);
  }
  async type(selector, value) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`no field ${selector}`);
    await sleep(150);
  }
  async shot(name, opts = {}) {
    if (opts.mobile) await this.cdp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 860, deviceScaleFactor: 1, mobile: true });
    await sleep(opts.wait ?? 800);
    let clip;
    if (opts.full) {
      const { contentSize } = await this.cdp.send("Page.getLayoutMetrics");
      clip = { x: 0, y: 0, width: opts.mobile ? 400 : 1440, height: Math.min(Math.ceil(contentSize.height), 12000), scale: 1 };
    }
    const { data } = await this.cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(opts.full), ...(clip ? { clip } : {}) });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
    if (opts.mobile) await this.cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    console.log(`  · ${name}.png`);
  }
  async close() {
    this.ws.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${this.targetId}`).catch(() => {});
  }
}

async function main() {
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => existsSync(p));
  if (!chrome) throw new Error("no Chrome");
  console.log("ONLYCHAIN — UI end-to-end with a stub wallet");

  await new Promise((r) => daemon.listen(DAEMON_PORT, "127.0.0.1", r));
  console.log("· hardhat node");
  spawnBg("npx", ["hardhat", "node", "--port", String(RPC_PORT)], join(ROOT, "chain"));
  await waitForHttp(RPC, 150, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }));
  console.log("· seed");
  const seedOut = join(mkdtempSync(join(tmpdir(), "oc-ui-")), "local.json");
  const code = await run("npx", ["hardhat", "run", "scripts/seed-local.ts", "--network", "localhost"], join(ROOT, "chain"), { HARDHAT_LOCALHOST_URL: RPC, SEED_OUT: seedOut });
  if (code !== 0) throw new Error("seed failed");
  const local = JSON.parse(readFileSync(seedOut, "utf8"));

  const dbDir = mkdtempSync(join(tmpdir(), "oc-ui-db-"));
  console.log(`· server on :${PORT}`);
  spawnBg("npx", ["next", "dev", "--port", String(PORT)], ROOT, {
    ONLYCHAIN_CHAIN_ID: "31337",
    ONLYCHAIN_RPC_URL: RPC,
    ONLYCHAIN_HUB: local.hub,
    ONLYCHAIN_TOKEN: local.token,
    NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID: "31337",
    NEXT_PUBLIC_ONLYCHAIN_RPC_URL: RPC,
    NEXT_PUBLIC_ONLYCHAIN_HUB: local.hub,
    NEXT_PUBLIC_ONLYCHAIN_TOKEN: local.token,
    NEXT_PUBLIC_ONLYCHAIN_CURVE: local.curve,
    ONLYCHAIN_DB_PATH: join(dbDir, "ui.db"),
    ONLYCHAIN_UPLOAD_DIR: join(dbDir, "uploads"),
    SESSION_SECRET: "ui-e2e-secret-ui-e2e-secret",
    NEXT_DIST_DIR: ".next-ui",
  });
  await waitForHttp(`${BASE}/api/health`, 400);
  console.log("· chrome");
  spawnBg(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${mkdtempSync(join(tmpdir(), "onlychain-ui-chrome-"))}`, `--remote-debugging-port=${CDP_PORT}`, "--hide-scrollbars", "--window-size=1440,900", "about:blank"], ROOT, {}, false);
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);
  // Warm the routes once so the timed steps below measure the app, not Turbopack.
  for (const p of ["/", "/home", "/explore", "/lunavega", "/studio", "/wallet", "/messages", "/api/creators", "/api/feed"]) await fetch(BASE + p).catch(() => {});

  const { onlyChainAbi, erc20Abi, curveAbi } = await import("../src/lib/abi/onlychain.ts");

  // ---- a fan signs in on the landing page ------------------------------------------------
  console.log("\nlanding → sign in");
  current = fan;
  let page = await Page.open();
  await page.goto("/");
  await page.eval(`localStorage.clear(); localStorage.setItem('onlychain:age-ok', '1'); true`);
  await page.goto("/");
  await page.waitFor(`document.body.innerText.includes('Sign in to support your favorite creators')`, 30_000, "landing");
  await page.shot("ui-landing");
  await page.shot("ui-landing-mobile", { mobile: true, full: true });
  await page.click("Connect wallet");
  await page.waitFor(`location.pathname === '/home'`, 60_000, "redirect to /home");
  await page.waitFor(`document.body.innerText.includes('Nothing here yet') || document.body.innerText.includes('Your feed is quiet')`, 30_000, "empty feed");
  let text = await page.text();
  check("one click on Connect wallet: signed in and on Home, the feed empty", text.includes("Subscribe to a creator and their posts land here"), text.slice(0, 400));
  check("the shell shows the fan's wallet in the nav", text.toLowerCase().includes(fan.address.slice(0, 6).toLowerCase()), text.slice(0, 300));
  await page.shot("ui-home-empty");

  // ---- Luna's page: locked, then subscribed --------------------------------------------------
  console.log("\nsubscribe");
  await page.goto("/lunavega");
  await page.waitFor(`document.body.innerText.includes('25 ONLY / month')`, 30_000, "Luna's plan");
  text = await page.text();
  check("Luna's page: cover, bio, 25 ONLY / month, 2 subscribers from the seed", text.includes("Luna Vega") && text.includes("Yoga + mobility coach") && text.includes("2 subscribers"), text.slice(0, 600));
  const veils = await page.eval(`document.querySelectorAll('.locked-veil').length`);
  check("subscriber-only posts show the veil, not the image", veils >= 4, veils);
  await page.shot("ui-creator-locked", { full: true });
  await page.click("Free for 3 days", "section button");
  await page.waitFor(`document.body.innerText.includes('To the creator')`, 20_000, "subscribe dialog");
  text = await page.text();
  check("the dialog offers Luna's 3-day trial and shows the 90 / 10 split for one month", text.includes("3-day free trial") && text.includes("22.5 ONLY") && text.includes("2.5 ONLY") && text.includes("25 ONLY"), text.slice(text.indexOf("To the creator"), text.indexOf("To the creator") + 200));
  check("bundle prices carry Luna's discounts: 3 months 67.5, 12 months 210", text.includes("67.5") && text.includes("210"), text.slice(0, 600));
  await page.shot("ui-subscribe-dialog");
  const lunaBefore = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [LUNA] });
  await page.click("Subscribe · 25 ONLY");
  await page.waitFor(`document.body.innerText.includes('Paid onchain')`, 90_000, "paid");
  const lunaAfter = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [LUNA] });
  check("Luna's wallet received 22.5 ONLY (approve + subscribe went through the stub)", lunaAfter - lunaBefore === parseEther("22.5"), (lunaAfter - lunaBefore).toString());
  const until = await pub.readContract({ address: local.hub, abi: onlyChainAbi, functionName: "subscribedUntil", args: [LUNA, fan.address] });
  check("the chain says the fan is subscribed for ~30 days", Number(until) > Date.now() / 1000 + 29 * 86400, Number(until));
  await page.click("Close");
  // innerText carries the CSS uppercase of buttons and eyebrows, so match case-insensitively
  await page.waitFor(`/subscribed/i.test(document.body.innerText) && document.body.innerText.includes('days left')`, 30_000, "subscribed state");
  await page.waitFor(`document.querySelectorAll('.locked-veil').length <= 1`, 30_000, "veils lifted");
  const imgs = await page.eval(`Array.from(document.querySelectorAll('article img')).filter((i) => i.src.includes('/api/media/')).length`);
  check("the veils lifted: post images now load through /api/media", imgs >= 4, imgs);
  await page.shot("ui-creator-subscribed", { full: true });

  // ---- tip ---------------------------------------------------------------------------------------
  console.log("\ntip");
  await page.click("Send tip");
  await page.waitFor(`document.body.innerText.includes('Send a tip')`, 20_000, "tip dialog");
  await page.click("10", ".grid button");
  const before10 = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [LUNA] });
  await page.click("Send 10 ONLY");
  await page.waitFor(`document.body.innerText.includes('Paid onchain')`, 90_000, "tip paid");
  const after10 = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [LUNA] });
  check("a 10 ONLY tip lands 9 ONLY in Luna's wallet", after10 - before10 === parseEther("9"), (after10 - before10).toString());
  await page.click("Close");

  // ---- pay-per-view --------------------------------------------------------------------------------
  console.log("\nunlock");
  await page.waitFor(`Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Unlock for'))`, 20_000, "ppv button");
  const ppvLabel = await page.eval(`Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Unlock for')).textContent.trim()`);
  await page.click("Unlock for", "button");
  await page.waitFor(`document.body.innerText.includes('Unlock this post')`, 20_000, "unlock dialog");
  await page.shot("ui-unlock-dialog");
  await page.click("Unlock for", ".card button");
  await page.waitFor(`document.body.innerText.includes('Paid onchain')`, 90_000, "unlocked");
  await page.click("Open it");
  await page.waitFor(`document.querySelectorAll('.locked-veil').length === 0`, 30_000, "no veil left");
  check(`the pay-per-view post opened (${ppvLabel})`, true);

  // ---- feed, subscriptions, wallet ------------------------------------------------------------------
  console.log("\nfan's pages");
  await page.goto("/home");
  await page.waitFor(`document.querySelectorAll('article').length > 0`, 30_000, "feed rows");
  text = await page.text();
  check("Home now carries Luna's posts and says 1 subscription", text.includes("1 subscription") && text.includes("Luna Vega"), text.slice(0, 300));
  await page.shot("ui-home-feed", { full: true });
  await page.goto("/subscriptions");
  await page.waitFor(`document.body.innerText.includes('days left')`, 30_000, "subscriptions");
  text = await page.text();
  check("Subscriptions lists Luna active with the three payments", text.includes("Luna Vega") && /active/i.test(text) && /payments/i.test(text) && text.includes("−25 ONLY") && text.includes("−10 ONLY"), text.slice(0, 700));
  await page.shot("ui-subscriptions");
  await page.goto("/wallet");
  await page.waitFor(`/spending allowance/i.test(document.body.innerText)`, 30_000, "wallet");
  text = await page.text();
  check("Wallet shows the balance, the exact allowance left and what was spent", /99,9\d\d/.test(text) && /spent/i.test(text) && text.includes(local.hub), text.slice(0, 800));
  await page.shot("ui-wallet");

  // ---- buy ONLY with ETH on the curve, from the wallet page ------------------------------------------
  console.log("\nbuy ONLY");
  const onlyBefore = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [fan.address] });
  // the site's quote must equal the curve's own arithmetic on the live reserves (the seed primed the curve with 2 ETH)
  const [q0, t0] = await pub.readContract({ address: local.curve, abi: curveAbi, functionName: "getReserves" });
  const feeBps = BigInt(await pub.readContract({ address: local.curve, abi: curveAbi, functionName: "feeBps" }));
  const ethIn = parseEther("0.05");
  const net = ethIn - (ethIn * feeBps) / 10_000n;
  const expectedOut = (t0 * net) / (q0 + net);
  const expectedText = Math.floor(Number(expectedOut) / 1e18).toLocaleString("en-US");
  await page.click("Buy $ONLY with ETH");
  await page.waitFor(`document.body.innerText.includes('You receive (about)')`, 20_000, "buy dialog");
  await page.click("0.05 ETH", ".grid button");
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(expectedText)})`, 20_000, "quote " + expectedText);
  check(`the dialog quotes 0.05 ETH at ${expectedText} ONLY — the curve's own figure on today's reserves`, true);
  await page.shot("ui-buy-dialog");
  await page.click("Buy for 0.05 ETH");
  await page.waitFor(`document.body.innerText.includes('Bought')`, 90_000, "bought");
  const onlyAfter = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [fan.address] });
  check("the wallet received exactly the quoted amount of ONLY from the curve", onlyAfter - onlyBefore === expectedOut, { got: (onlyAfter - onlyBefore).toString(), expected: expectedOut.toString() });
  await page.click("Done");

  // ---- withdraw: sell ONLY back to ETH, send ETH to another wallet ------------------------------------
  console.log("\nwithdraw");
  const sellAmount = (onlyAfter - onlyBefore) / 2n;
  const [q1, t1] = await pub.readContract({ address: local.curve, abi: curveAbi, functionName: "getReserves" });
  const gross = (q1 * sellAmount) / (t1 + sellAmount);
  const expectedEth = gross - (gross * feeBps) / 10_000n;
  const ethBefore = await pub.getBalance({ address: fan.address });
  await page.click("Sell $ONLY for ETH");
  await page.waitFor(`document.body.innerText.includes('ETH the curve holds')`, 20_000, "sell dialog");
  await page.type("input[aria-label='ONLY to sell']", (Number(sellAmount) / 1e18).toFixed(6));
  await page.waitFor(`document.body.innerText.includes('You receive (about)')`, 20_000, "sell quote");
  await page.shot("ui-sell-dialog");
  // the dialog's own button, by its exact label (the page has a "Sell $ONLY for ETH" opener too)
  await page.click(`Sell ${Math.floor(Number(sellAmount) / 1e18).toLocaleString("en-US")} ONLY`, "button");
  await page.waitFor(`document.body.innerText.includes('ETH received')`, 90_000, "sold");
  const ethAfter = await pub.getBalance({ address: fan.address });
  const gained = ethAfter - ethBefore;
  check("selling half the ONLY paid out ETH within 1 % of the site's quote (minus gas)", gained > (expectedEth * 98n) / 100n && gained <= expectedEth, { gained: gained.toString(), expected: expectedEth.toString() });
  await page.click("Done");

  const makerBefore = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [maker.address] });
  await page.click("Send to another wallet");
  await page.waitFor(`document.body.innerText.includes('To cash out to a bank')`, 20_000, "send dialog");
  await page.click("$ONLY", "button");
  await page.type("input[aria-label='Recipient']", maker.address);
  await page.type("input[aria-label='Amount']", "12.5");
  await page.click("Send 12.5 ONLY");
  await page.waitFor(`document.body.innerText.includes('Sent.')`, 90_000, "sent");
  const makerAfter = await pub.readContract({ address: local.token, abi: erc20Abi, functionName: "balanceOf", args: [maker.address] });
  check("12.5 ONLY sent to another wallet arrived", makerAfter - makerBefore === parseEther("12.5"), (makerAfter - makerBefore).toString());
  await page.click("Done");
  await page.shot("ui-wallet-cashout", { full: true });
  await page.close();

  // ---- a new wallet becomes a creator ------------------------------------------------------------------
  console.log("\nbecome a creator");
  current = maker;
  page = await Page.open({ fresh: true });
  await page.goto("/");
  await page.eval(`localStorage.clear(); localStorage.setItem('onlychain:age-ok', '1'); true`);
  await page.goto("/studio");
  await page.waitFor(`document.body.innerText.includes('Sign in to see your studio')`, 30_000, "studio door");
  await page.click("Connect wallet");
  await page.waitFor(`document.body.innerText.includes('Open your page')`, 60_000, "onboarding");
  await page.type("input[placeholder=yourname]", "maker.jo");
  await page.type("input[placeholder='How fans see you']", "Jo Maker");
  await page.type("textarea", "Woodwork, one build a week.");
  await page.shot("ui-studio-onboarding");
  await page.click("Open my page");
  await page.waitFor(`/subscription plan/i.test(document.body.innerText)`, 30_000, "studio");
  text = await page.text();
  check("the page opens: Studio shows 0 earned and no plan yet", text.includes("Not set yet") && text.includes("0 ONLY"), text.slice(0, 500));
  await page.type("input[inputmode=decimal]", "12");
  await page.click("Set plan");
  await page.waitFor(`document.body.innerText.includes('Plan saved on the chain.')`, 90_000, "plan saved");
  const plan = await pub.readContract({ address: local.hub, abi: onlyChainAbi, functionName: "plans", args: [maker.address] });
  check("setPlan went through the stub: 12 ONLY, open", plan[0] === parseEther("12") && plan[1] === true, plan.map(String));
  await page.type("textarea[placeholder='Compose new post…']", "First build of the season — the workbench.");
  await page.click("Post");
  await page.waitFor(`document.querySelectorAll('article').length > 0`, 30_000, "post listed");
  text = await page.text();
  check("the first post appears in the studio, subscribers-only by default", text.includes("First build of the season") && text.includes("Subscribers"), text.slice(0, 600));
  await page.shot("ui-studio", { full: true });
  await page.goto("/maker.jo");
  await page.waitFor(`document.body.innerText.includes('12 ONLY / month') || /edit profile/i.test(document.body.innerText)`, 30_000, "own page");
  text = await page.text();
  check("onlychain/maker.jo is live with the post", text.includes("Jo Maker") && text.includes("@maker.jo") && text.includes("First build of the season"), text.slice(0, 500));
  await page.shot("ui-new-creator", { full: true });
  await page.shot("ui-new-creator-mobile", { mobile: true, full: true });
  await page.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    daemon.close();
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
