"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { useSession } from "@/components/session";
import { ColumnHeader } from "@/components/shell/AppShell";
import { site } from "@/lib/site";

/**
 * The creator portal: what opening a page takes (a wallet), what it pays
 * (the split, instantly), what can be sold. One button; it signs the wallet
 * in and lands on Studio, where the page and the price are set.
 */
export function CreatorPortal() {
  const { session, profile, signIn, step } = useSession();
  const router = useRouter();
  const share = 100 - site.feeBps / 100;

  const start = async () => {
    if (session) return router.push("/studio");
    const ok = await signIn();
    if (ok) router.push("/studio");
  };

  return (
    <>
      <ColumnHeader title="For creators" sub="No identity. No bank. A wallet." />
      <article className="px-4 pb-10">
        <section className="py-6">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">Open a page. Keep {share}%. Get paid the second a fan pays.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            {site.name} asks for nothing but a wallet. No name, no ID, no bank account, no payout schedule: subscriptions, tips and pay-per-view are paid in ${site.token.symbol} straight from the fan&apos;s wallet to yours, in the same transaction. The site never holds your money and cannot hold it back.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-accent btn-lg" onClick={start} disabled={step !== "idle"}>
              {step === "idle" ? (profile?.isCreator ? "Open Studio" : session ? "Open my page" : "Connect a wallet to start") : "Signing in…"}
            </button>
            <Link href="/token#how" className="text-[14px] font-medium text-accent hover:underline">
              How the money moves
            </Link>
          </div>
        </section>

        <section className="grid gap-3 border-t border-line py-6 sm:grid-cols-3">
          {[
            ["1", "Connect a wallet", "One signature. That wallet is your login and your payout address — there is nothing else to create."],
            ["2", "Name your page", "A handle, a display name, a line about you, a cover. Nothing about who you are."],
            ["3", "Set your price", `Your monthly price goes on the chain. From then on every payment lands in your wallet, ${share}% of it, instantly.`],
          ].map(([n, title, body]) => (
            <div key={n} className="card p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">{n}</span>
              <h2 className="mt-3 text-[15px] font-semibold">{title}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-line py-6">
          <h2 className="text-[20px] font-bold">What you can sell</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["bookmark", "Subscriptions", "1 to 12 months at your price. Subscribers see your subscriber-only posts until the date on the chain. No auto-renewal, no chargebacks."],
                ["lock", "Pay-per-view posts", "A post with its own price. The image or video is never sent to a wallet that has not paid; once paid, it is theirs for good."],
                ["message", "Paid messages", "Send a photo or a video in a DM with a price on it. The fan unlocks it in the thread, in $ONLY, and you are paid on the spot."],
                ["coin", "Tips", "On any post or from your page. Same split, same instant settlement."],
              ] as [IconName, string, string][]
            ).map(([icon, title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                  <Icon name={icon} size={18} />
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold">{title}</h3>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line py-6">
          <h2 className="text-[20px] font-bold">The split, written in the contract</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div className="card p-4">
              <dt className="eyebrow">You keep</dt>
              <dd className="mt-1 text-[24px] font-bold tracking-[-0.02em]">{share}%</dd>
            </div>
            <div className="card p-4">
              <dt className="eyebrow">{site.name}</dt>
              <dd className="mt-1 text-[24px] font-bold tracking-[-0.02em]">{site.feeBps / 100}%</dd>
            </div>
            <div className="card p-4">
              <dt className="eyebrow">Payout delay</dt>
              <dd className="mt-1 text-[24px] font-bold tracking-[-0.02em]">0</dd>
            </div>
          </dl>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            The share is an immutable number in the contract, not a setting. There is no minimum payout, no weekly cycle, no account to verify before you can withdraw — there is nothing to withdraw, it is already in your wallet.
          </p>
        </section>

        <section className="border-t border-line py-6">
          <h2 className="text-[20px] font-bold">Straight answers</h2>
          <dl className="mt-4 space-y-4">
            {[
              ["Do I have to prove who I am?", "No. A wallet is the whole account. The optional verified badge is granted by the operator on request and is the only thing that involves an identity check."],
              ["Where are my files?", "On the site's servers, served only to wallets the chain says may see them. The chain records who paid; it never carries the media."],
              [`What if the price of $${site.token.symbol} moves?`, "Your prices are in the coin, so their value in dollars moves with it. Change your price whenever you like; existing subscriptions keep their end dates."],
              ["Can the site freeze my earnings?", "It cannot: it never has them. It can remove content that breaks the rules, and that is all it can touch."],
            ].map(([q, a]) => (
              <div key={q}>
                <dt className="text-[15px] font-semibold">{q}</dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink-2">{a}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className="btn btn-accent btn-lg mt-6" onClick={start} disabled={step !== "idle"}>
            {profile?.isCreator ? "Open Studio" : "Open my page"}
          </button>
        </section>
      </article>
    </>
  );
}
