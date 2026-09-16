"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { Icon } from "@/components/Icon";
import { site } from "@/lib/site";

const YEAR = new Date().getUTCFullYear();

/**
 * The left half of the landing page — where the reference has its log-in
 * form. There is no form: one wallet signature is the whole sign-in.
 */
export function SignInPanel() {
  const { signIn, step, error, walletAvailable } = useSession();
  const router = useRouter();

  const busy = step !== "idle";
  const label = step === "connecting" ? "Connecting…" : step === "signing" ? "Sign the message in your wallet…" : step === "verifying" ? "Verifying…" : "Connect wallet";

  return (
    <div className="w-full max-w-[360px] fade-up">
      <h1 className="text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink">Sign in to support your favorite creators</h1>
      <p className="mt-2 text-[14px] text-ink-2">One wallet signature. No password, no email, no card — payments are made in ${site.token.symbol}, straight to the creator.</p>

      <button
        type="button"
        className="btn btn-accent btn-lg btn-block mt-7"
        disabled={busy}
        onClick={async () => {
          const ok = await signIn();
          if (ok) router.push("/home");
        }}
      >
        {busy ? <Icon name="spinner" size={18} className="spin" /> : <Icon name="wallet" size={18} />}
        {label}
      </button>

      {!walletAvailable && <p className="mt-3 text-[13px] text-ink-2">No browser wallet detected. Install one (MetaMask, Rabby, Coinbase Wallet…) and reload this page.</p>}
      {error && (
        <p className="mt-3 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}

      <p className="mt-4 text-[12px] leading-relaxed text-ink-2">
        By signing in you confirm you are at least {site.minAge} years old and agree to the{" "}
        <Link href="/token#terms" className="text-accent hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/token#privacy" className="text-accent hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <div className="my-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.06em] text-ink-3">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <Link href="/explore" className="btn btn-ghost btn-lg btn-block">
        <Icon name="compass" size={18} />
        Browse creators first
      </Link>
      <p className="mt-3 text-center text-[13px] text-ink-2">
        Creator?{" "}
        <Link href="/creators" className="font-medium text-accent hover:underline">
          Open your page with a wallet — no identity needed
        </Link>
      </p>

      <ul className="mt-8 space-y-2 text-[13px] text-ink-2">
        <li className="flex items-start gap-2">
          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            Creators keep <b className="text-ink">{100 - site.feeBps / 100}%</b> of every subscription, tip and unlock.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            Paid <b className="text-ink">wallet to wallet</b> in the same transaction — the site never holds your ${site.token.symbol}.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            Your subscriptions are <b className="text-ink">onchain</b>: no card on file, nothing to chase.
          </span>
        </li>
      </ul>

      {process.env.NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID === "31337" && (
        <p className="mt-6 rounded-[8px] border border-dashed border-line-2 px-3 py-2 text-[12px] text-ink-2">
          Local demo — enter without a wallet as{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a route handler that sets the cookie and redirects */}
          <a href="/api/dev/login?as=theo" className="font-medium text-accent hover:underline">
            Theo (fan)
          </a>{" "}
          or{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- same */}
          <a href="/api/dev/login?as=lunavega" className="font-medium text-accent hover:underline">
            Luna (creator)
          </a>
          . Sample wallets on the local chain only.
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <Link href="/token" className="hover:text-ink-2">
          ${site.token.symbol} token
        </Link>
        <Link href="/token#how" className="hover:text-ink-2">
          How it works
        </Link>
        <Link href="/token#faq" className="hover:text-ink-2">
          FAQ
        </Link>
        <span>© {YEAR} {site.name}</span>
      </div>
    </div>
  );
}
