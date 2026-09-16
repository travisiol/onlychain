import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { Logo } from "@/components/Logo";
import { SignInPanel } from "@/components/landing/SignInPanel";
import { site } from "@/lib/site";

/**
 * Signed out: the split page — sign-in on the left, the logo panel on the
 * right, exactly where the reference puts them. Signed in: straight to the
 * feed, as the reference does.
 */
export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/home");

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      {/* logo panel — first on phones (short), right half on desktop. Black, as the logo was made. */}
      <section className="relative order-first flex min-h-[40dvh] flex-col justify-between overflow-hidden bg-[#000] px-6 py-6 text-white lg:order-last lg:min-h-dvh lg:w-1/2 lg:px-14 lg:py-12">
        <div className="relative z-10 flex items-center justify-between text-[12px] font-medium uppercase tracking-[0.14em] text-white/55">
          <span>Creators · paid in ${site.token.symbol}</span>
          <span className="hidden lg:inline">Robinhood Chain</span>
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center py-6 text-center">
          {/* the logo file itself, on the black it was made for */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-dark.png" alt={site.name} width={1060} height={635} className="w-[min(78vw,340px)] lg:w-[min(36vw,520px)]" draggable={false} />
          <p className="mt-2 max-w-[440px] text-[15px] leading-snug text-white/70 lg:text-[18px]">{site.tagline}</p>
        </div>

        <dl className="relative z-10 hidden grid-cols-3 gap-4 border-t border-white/10 pt-5 text-white/85 lg:grid">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-white/45">To creators</dt>
            <dd className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">{100 - site.feeBps / 100}%</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-white/45">Held by the site</dt>
            <dd className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">0 {site.token.symbol}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-white/45">Sign-in</dt>
            <dd className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">1 signature</dd>
          </div>
        </dl>

      </section>

      {/* sign-in half */}
      <section className="flex flex-1 flex-col px-6 py-8 lg:w-1/2 lg:px-16 lg:py-10">
        <div>
          <Logo width={170} />
        </div>
        <div className="flex flex-1 items-center justify-center py-10 lg:justify-start lg:pl-[8%]">
          <SignInPanel />
        </div>
      </section>
    </main>
  );
}
