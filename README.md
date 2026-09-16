# ONLYCHAIN

Support your favorite creators. Pay in **$ONLY**.

The creator-subscription platform, paid in one coin. Subscriptions, tips and
pay-per-view are settled **wallet to wallet** on Robinhood Chain by one small
contract that keeps nothing: the fan's $ONLY goes to the creator (90 %) and to
the platform address (10 %) in the same transaction. The site holds the content
and reads the chain to decide who sees what.

- Sign-in = one wallet signature. No password, no email, no card. Every browser wallet that
  announces itself is listed (MetaMask, Rabby, Coinbase Wallet, Phantom…); set
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for mobile wallets by QR.
- $ONLY is bought **inside the site**, with ETH, on the coin's Pons V2 launch curve
  (`NEXT_PUBLIC_ONLYCHAIN_CURVE`): the Wallet page, the token page, and every pay dialog that
  finds the wallet short. Quoted from the curve's reserves with the curve's own maths; after
  graduation the button points to `NEXT_PUBLIC_ONLYCHAIN_BUY_URL` (the DEX).
- Creators open a page with a wallet and nothing else — `/creators` says so; Studio sets the price.
- Messages work like the reference: a thread per wallet, files attached, and a creator can put a
  price on a file — the fan unlocks it in the thread, in $ONLY.
- A subscription is a record on the chain with an end date. No auto-renewal. Creators set
  bundle discounts for 3 / 6 / 12 months and a free trial (once per wallet) — in the contract.
- Posts carry up to ten files (carousel), can be pinned, edited, scheduled; fans save them to
  Collections; comments can be removed; posts and profiles can be reported.
- Creators get a welcome message for new subscribers, one message to all subscribers, a block
  list, monthly statements (CSV), and a vault of their uploads.
- Every price carries a **≈ $ shadow**: ONLY→ETH from the curve's reserves, ETH→USD from Pyth
  (Hermes with `PYTH_API_KEY`, else the last print pushed on Robinhood Chain, else `ONLYCHAIN_ETH_USD`
  for a local demo). A display aid, never a peg.
- Paid media is **watermarked with the viewer's wallet** on screen (screenshots carry it); an
  operator desk at `/ops` (wallets in `OPS_ADDRESSES`) handles reports, the verified badge and
  suspensions; uploads, DMs, posts, comments, reports and sign-in nonces are rate-limited.
- Smart-contract wallets sign in too (ERC-1271 / 6492 checked through the chain).
- **Withdrawing**: there is nothing held by the site — earnings sit in the creator's wallet. The
  Wallet page sells $ONLY for ETH on the curve (`sell`, quoted like the real one) and sends ETH or
  $ONLY to any address (an exchange deposit address on the way to a bank; set
  `NEXT_PUBLIC_ONLYCHAIN_BRIDGE_URL` to show the chain's bridge).
- A locked post shows a veil, never the image; the file's URL never leaves the server.
- The contract has no owner, no pause, no upgrade, no balance.

## How a payment moves

1. The fan approves the hub to spend $ONLY (once, or per payment — the "card on file").
2. `subscribe(creator, months)` / `tip(creator, amount, ref)` / `unlock(creator, contentId, amount)`
   move the coin: `feeBps` to `feeRecipient`, the rest to the creator, and record
   `subscribedUntil[creator][fan]` or `unlockedAmount[fan][contentId]`.
3. The browser posts the transaction hash to `/api/chain/sync`; the server indexes the
   receipt, drops its read cache, and the page reflects the payment immediately.
4. Every access check (`view.ts`) ends in a chain read: `isSubscribed`, `unlockedAmount`.

Content ids: `keccak256("post:<id>")`, `keccak256("msg:<id>")`.

## Run it

```bash
# 1. the chain (Hardhat node on 8766, then the seed)
cd chain && npm install && npm run node          # terminal A
cd chain && npm run seed                         # terminal B: token + hub + plans + sample payments

# 2. the site
cp .env.example .env.local                       # already points at the local node
npm install && npm run dev                       # http://localhost:3766
```

The seed mints 100 000 ONLY to Hardhat's default accounts, sets the ten sample
creators' plans (accounts #1–#10) and has three fans subscribe and tip. Account
#15 (`0xcd3B…ce71`) stays clean for browser tests. Import a Hardhat key into a
browser wallet pointed at `http://127.0.0.1:8766` (chain id 31337) to try it —
or, on the local chain only, use the demo links on the landing page
(`/api/dev/login?as=theo`, `?as=lunavega`) to enter as a sample fan or creator.

The sample creators are invented: their faces are StyleGAN people who do not
exist (thispersondoesnotexist.com, adults only), banners and photo posts are
Lorem Picsum placeholders, the rest is generated SVG art. No real person is
shown on the site; real creators sign up with their own wallet.

## Proofs

```bash
cd chain && npm test        # 17 Hardhat tests: split, bundles, trial, renewals, free pages, no owner, no balance, the curve buy/sell quotes
npm test                    # 6 unit tests (ABI ⇄ compiler export, formatting, storage fallback)
npm run e2e                 # 82 checks: API + chain on a private node/server (ports 8767/3767)
npm run e2e:ui              # 22 checks: real pages in headless Chrome with a stub wallet (8768/3768) — incl. buying, selling, sending ONLY
npm run go-live             # preflight: token, hub, curve and secrets against the RPC the env points at
                            #   → docs/captures/ui-*.png
npm run lint && npm run typecheck && npm run build
```

## Layout

```
chain/            Hardhat 2 + OZ 5 — OnlyChain.sol, MockONLY.sol, tests, seed-local.ts, deploy.ts
src/app/          routes: / (landing) · /home · /explore · /[handle] · /p/[id] · /messages
                  /notifications · /subscriptions · /wallet · /studio · /settings · /token · /api/*
src/lib/server/   sqlite (node:sqlite), auth (nonce + personal_sign + HMAC cookie), chain reads
                  with a 12 s cache, event sync, access rules, media streaming, seed
src/lib/client/   the pay hook (connect → switch → approve → pay → sync), api, clock, location
src/components/   the OnlyFans shell (left nav / column / suggestions), post cards, dialogs
public/brand/     the logo files (cropped by scripts/brand.mjs from brand-src/)
public/seed/      sample media: generated SVG art (scripts/seed-art.mjs) and photos/ (faces, banners)
```

## Go live — the day the coin has a contract address

1. Open **`/setup`** on the site (any deployment, even local pointed at Robinhood Chain), paste the
   coin's CA: the page reads name / symbol / decimals / supply from the chain. Paste the coin's Pons V2
   curve address too, so fans can buy it inside the site.
2. Connect the wallet that will own nothing (the hub has no owner) but pays the gas, pick where the
   platform share goes (your wallet or the burn address) and the fee, click **Deploy OnlyChain hub**.
   The page verifies the deployed hub's `token()` is the CA and prints the env lines.
3. Set them on the host — `NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID=4663`, `NEXT_PUBLIC_ONLYCHAIN_TOKEN`,
   `NEXT_PUBLIC_ONLYCHAIN_HUB`, `NEXT_PUBLIC_ONLYCHAIN_CURVE`, plus `SESSION_SECRET` — and redeploy.
4. `npm run go-live` (or `/setup` again) must say the hub matches the token. Every payment on the
   site now moves the real coin: approve → subscribe / tip / unlock, 90 % to the creator's wallet.

From the terminal instead: `ONLY_TOKEN=0x… FEE_RECIPIENT=0x… FEE_BPS=1000 DEPLOYER_KEY=0x… npm run deploy`
in `chain/`. The hub's `buy` path expects the curve's `buy(uint256,uint256,address)` / `getReserves()`,
which is what Pons V2 exposes (the local MockCurve mirrors it); after graduation set
`NEXT_PUBLIC_ONLYCHAIN_BUY_URL` to the DEX page and the Buy button links there.

## Deploy
- **Site**: a single Next app at the repo root — importing the repo into Vercel works as is.
  Set `SESSION_SECRET`. Node ≥ 22.13 (`node:sqlite`). On Vercel the SQLite file and the
  uploads fall back to `/tmp` and `/api/health` answers `storage.ephemeral: true`: fine to
  show the site, not to keep real content — point `ONLYCHAIN_DB_PATH` / `ONLYCHAIN_UPLOAD_DIR`
  at a persistent disk, or move storage to a hosted database and object store.

## Open

- The coin itself: `$ONLY` is referenced by address only; the mock is for the local node.
- Platform share destination (treasury vs burn) and the 10 % rate — constructor arguments.
- Creator identity checks are an operator process (the badge is granted on `/ops`); moderation is
  reports → hide / suspend on the same desk. Age verification is a checkbox and a signed line: where
  the law requires a real check, plug a provider in before the 18+ gate.
- Live streams and 24-hour stories are not built (streaming needs its own infrastructure).
- USD reference next to prices; ERC-1271 (smart-contract) wallets; a WalletConnect project id for mobile.
- Legal copy on `/token#terms` is a placeholder.
