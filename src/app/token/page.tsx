import type { Metadata } from "next";
import Link from "next/link";
import { AppShell, ColumnHeader } from "@/components/shell/AppShell";
import { Icon } from "@/components/Icon";
import { BuyButton } from "@/components/pay/BuyButton";
import { chain, explorerAddress } from "@/lib/chain";
import { hubInfo } from "@/lib/server/chainReads";
import { serverChainEnv } from "@/lib/server/env";
import { fmtOnly } from "@/lib/format";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: `$${site.token.symbol} — the coin behind ${site.name}` };
export const dynamic = "force-dynamic";

/**
 * What the coin is, how a payment moves, what the contract can and cannot
 * do, and the honest answers to the objections. Reads the deployed hub's
 * immutables so the numbers on this page are the chain's, not ours.
 */
export default async function TokenPage() {
  const env = serverChainEnv();
  const info = await hubInfo();
  const feeBps = info?.feeBps ?? site.feeBps;
  const creatorShare = 100 - feeBps / 100;

  return (
    <AppShell>
      <ColumnHeader title={`$${site.token.symbol}`} sub="The coin every payment is made in" />
      <article className="px-4 pb-10">
        <section className="py-6">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">One coin. Wallet to wallet. Nothing held.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            {site.name} is the creator subscription platform paid in <b className="text-ink">${site.token.symbol}</b>. Subscriptions, tips and pay-per-view are settled on {chain.name} by one small contract that moves the coin from the fan to the creator in the same transaction — and keeps none of it.
          </p>
          <dl className="mt-5 grid grid-cols-3 gap-3">
            <div className="card p-4">
              <dt className="eyebrow">To creators</dt>
              <dd className="mt-1 text-[24px] font-bold tracking-[-0.02em]">{creatorShare}%</dd>
            </div>
            <div className="card p-4">
              <dt className="eyebrow">Platform share</dt>
              <dd className="mt-1 text-[24px] font-bold tracking-[-0.02em]">{feeBps / 100}%</dd>
              <dd className="text-[12px] text-ink-3">{info ? (info.burns ? "burned" : "to the treasury") : "fixed at deploy"}</dd>
            </div>
            <div className="card p-4">
              <dt className="eyebrow">Held by the site</dt>
              <dd className="mt-1 text-[24px] font-bold tracking-[-0.02em]">0</dd>
            </div>
          </dl>
        </section>

        <section id="how" className="border-t border-line py-6">
          <h2 className="text-[20px] font-bold">How a payment moves</h2>
          <ol className="mt-4 space-y-4">
            {[
              ["You sign in with your wallet", "One signature, no gas. Your wallet is the account — the same one that pays and, if you create, gets paid."],
              [`You approve $${site.token.symbol} once`, `The “card on file”: you let the hub spend a set amount (or unlimited) of your $${site.token.symbol}. You can lower or revoke it on Wallet at any time.`],
              ["You subscribe, tip or unlock", `The hub sends ${creatorShare}% to the creator's wallet and ${feeBps / 100}% to the platform address in the same transaction, then records the subscription end date or the unlock against your wallet.`],
              ["The site reads the chain", "Who is subscribed to whom, until when, and who paid for what is read from the contract — the site decides what you see from that, and it cannot invent a subscription you did not pay for."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="text-[15px] font-semibold">{title}</h3>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-6">
          <h2 className="text-[20px] font-bold">The contract</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            <code className="mono text-[13px]">OnlyChain.sol</code> has no owner, no pause, no upgrade and no balance: it can only move tokens from the caller to a creator and to the fixed platform address. Its three functions — <code className="mono text-[13px]">subscribe</code>, <code className="mono text-[13px]">tip</code>, <code className="mono text-[13px]">unlock</code> — and the platform share are what they were on the day it was deployed.
          </p>
          <dl className="card mt-4 divide-y divide-line text-[13px]">
            <Row label="Network" value={`${chain.name} · chain id ${env.chainId}`} />
            <Row label={`$${site.token.symbol} token`} value={info?.token ?? env.token ?? "not configured"} link={info?.token ? explorerAddress(info.token) : null} />
            <Row label="Hub" value={info?.hub ?? env.hub ?? "not configured"} link={info?.hub ? explorerAddress(info.hub) : null} />
            <Row label="Platform address" value={info ? `${info.feeRecipient}${info.burns ? " (burn)" : ""}` : "—"} link={info ? explorerAddress(info.feeRecipient) : null} />
            <Row label="Supply" value={info ? `${fmtOnly(info.totalSupply, { symbol: false })} ${info.tokenSymbol}` : "—"} />
          </dl>
          {!info && <p className="mt-2 text-[13px] text-ink-3">The chain did not answer, or no hub is configured on this deployment — the values above are the site&apos;s defaults.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <BuyButton />
            {site.buyUrl && (
              <a href={site.buyUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
                Market <Icon name="external" size={14} />
              </a>
            )}
          </div>
          <p className="mt-2 text-[13px] text-ink-3">Bought with ETH on the launch curve, quoted from its reserves; after graduation the button points to the market.</p>
        </section>

        <section id="faq" className="border-t border-line py-6">
          <h2 className="text-[20px] font-bold">Questions people actually ask</h2>
          <dl className="mt-4 space-y-5">
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <dt className="text-[15px] font-semibold">{q}</dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink-2">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="terms" className="border-t border-line py-6 text-[13px] leading-relaxed text-ink-2">
          <h2 className="text-[16px] font-bold text-ink">Terms of Service (placeholder)</h2>
          <p className="mt-2">You must be {site.minAge} or older. Creators are responsible for the content they publish and for the rights to it. Payments are transactions on a public blockchain: they are final and cannot be reversed by {site.name}. {site.name} may remove content and pages that break the law or these terms; it cannot touch anyone&apos;s coins. This text is a placeholder to be replaced by counsel before launch.</p>
          <h2 id="privacy" className="mt-6 text-[16px] font-bold text-ink">Privacy (placeholder)</h2>
          <p className="mt-2">The site stores your wallet address, the profile you fill in, what you post and message, and which posts you like. Payments are public on the chain by nature: anyone can see that a wallet paid another wallet. The site never sees a private key. Uploaded files are stored on the site&apos;s server and served only to wallets the chain says may see them.</p>
        </section>

        <p className="pt-2 text-[12px] text-ink-3">
          <Link href="/explore" className="text-accent hover:underline">
            Back to creators
          </Link>
        </p>
      </article>
    </AppShell>
  );
}

function Row({ label, value, link }: { label: string; value: string; link?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-ink-2">{label}</dt>
      <dd className="mono min-w-0 truncate">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

const FAQ: [string, string][] = [
  [
    "Isn't paying in one coin a problem when its price moves?",
    `Yes, for both sides: a 25 ${site.token.symbol} subscription is worth whatever ${site.token.symbol} is worth that day. Creators set prices in ${site.token.symbol} and can change them any time (existing subscriptions keep their dates). A USD reference next to prices is on the list; it will be a display aid, not a peg.`,
  ],
  [
    "If the contract holds nothing, what does the site actually control?",
    "The content and the accounts: posts, media, messages, handles, moderation. The money never passes through the site. That means the site cannot refund, cannot freeze a creator's earnings and cannot lose your funds — and also cannot help if you paid the wrong page.",
  ],
  [
    "Where does the platform share go?",
    `To one address fixed at deployment — a treasury, or the burn address, in which case every payment permanently removes ${site.token.symbol} from circulation. It is written in the contract, shown on this page, and cannot be changed afterwards.`,
  ],
  [
    "Is the content on the chain?",
    "No. Files live on the site's servers; the chain only records who paid for what. Putting media on-chain is neither practical nor private. What the chain gives you is that your access follows your wallet: a subscription cannot be quietly revoked, and a pay-per-view purchase is yours for good.",
  ],
  [
    "What about age verification and creator identity?",
    `Viewers confirm they are ${site.minAge}+ when they enter and again in the sign-in message. Creator identity checks (documents, payout identity) are an off-chain process the operator runs before the “verified” badge is granted; nothing about it is automated in this version.`,
  ],
  [
    "Can a subscription auto-renew?",
    "No. A subscription is a fixed number of months paid up front. When it lapses you are simply no longer subscribed; renewing before the end extends from the end date. Nothing is ever charged without a transaction you sign.",
  ],
];
