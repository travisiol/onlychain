"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { Logo, MarkImg } from "@/components/Logo";
import { useSession } from "@/components/session";
import { RightRail } from "@/components/shell/RightRail";
import { AgeGate } from "@/components/shell/AgeGate";
import { displayName, handleOf, profileHref } from "@/lib/format";
import { api } from "@/lib/client/api";
import { site } from "@/lib/site";

/**
 * The three columns of the reference: navigation on the left, one narrow
 * column of content, suggestions on the right. On a phone the left column
 * becomes a bottom bar and the right one disappears.
 */

type NavItem = { href: string; label: string; icon: IconName; badge?: number; auth?: boolean; hideWhenSignedIn?: boolean };

export function AppShell({ children, right, wide = false }: { children: ReactNode; right?: ReactNode | null; wide?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, profile, unread, ops, signIn, signOut, step } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);

  // close the menu when the route changes — adjusting state during render, not in an effect
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMoreOpen(false);
  }

  const notifications = useQuery({
    queryKey: ["notifications-peek", session?.address],
    queryFn: () => api<{ unseen: number }>("/api/notifications?peek=1"),
    enabled: Boolean(session),
    refetchInterval: 20_000,
  });

  const me = profile;
  const isCreator = Boolean(me?.isCreator);
  const items: NavItem[] = [
    { href: "/home", label: "Home", icon: "home", auth: true },
    { href: "/explore", label: "Explore", icon: "compass" },
    { href: "/creators", label: "For creators", icon: "star", auth: false, hideWhenSignedIn: true },
    { href: "/notifications", label: "Notifications", icon: "bell", badge: notifications.data?.unseen, auth: true },
    { href: "/messages", label: "Messages", icon: "message", badge: unread, auth: true },
    { href: "/collections", label: "Collections", icon: "bookmark", auth: true },
    { href: "/subscriptions", label: "Subscriptions", icon: "users", auth: true },
    { href: "/wallet", label: "Wallet", icon: "wallet", auth: true },
    ...(me ? [{ href: profileHref(me), label: "My profile", icon: "user" as IconName }] : []),
    ...(isCreator ? [{ href: "/studio", label: "Studio", icon: "studio" as IconName, auth: true }] : []),
  ];
  const visible = items.filter((i) => (!i.auth || session) && !(i.hideWhenSignedIn && session));
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1240px]">
      <AgeGate />
      {/* left column */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col justify-between border-r border-line px-3 py-4 md:flex md:w-[76px] xl:w-[260px] xl:px-4">
        <div>
          <Link href={session ? "/home" : "/"} className="flex items-center px-2 py-1" aria-label={site.name}>
            <span className="xl:hidden">
              <MarkImg size={44} />
            </span>
            <span className="hidden xl:inline">
              <Logo width={150} />
            </span>
          </Link>
          <nav className="mt-2 space-y-0.5">
            {visible.map((item) => (
              <Link key={item.href} href={item.href} className={`nav-row relative ${active(item.href) ? "is-active" : ""}`} title={item.label}>
                <span className="relative">
                  <Icon name={item.icon} size={24} />
                  {item.badge ? <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{item.badge > 99 ? "99+" : item.badge}</span> : null}
                </span>
                <span className="hidden xl:inline">{item.label}</span>
              </Link>
            ))}
            <div className="relative">
              <button type="button" className="nav-row w-full" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
                <Icon name="more" size={24} />
                <span className="hidden xl:inline">More</span>
              </button>
              {moreOpen && (
                <div className="card absolute left-0 top-12 z-30 w-[240px] overflow-hidden py-1 shadow-[var(--shadow-pop)]">
                  <Link href="/token" className="flex items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-bg-2">
                    <Icon name="coin" size={20} /> ${site.token.symbol} token
                  </Link>
                  <Link href="/token#how" className="flex items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-bg-2">
                    <Icon name="info" size={20} /> How it works
                  </Link>
                  <Link href="/creators" className="flex items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-bg-2">
                    <Icon name="star" size={20} /> For creators
                  </Link>
                  {session && (
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-bg-2">
                      <Icon name="settings" size={20} /> Settings
                    </Link>
                  )}
                  {ops && (
                    <Link href="/ops" className="flex items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-bg-2">
                      <Icon name="shield" size={20} /> Operator
                    </Link>
                  )}
                  {session ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] hover:bg-bg-2"
                      onClick={async () => {
                        await signOut();
                        router.push("/");
                      }}
                    >
                      <Icon name="logout" size={20} /> Log out
                    </button>
                  ) : (
                    <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] hover:bg-bg-2" onClick={() => signIn()}>
                      <Icon name="wallet" size={20} /> Sign in
                    </button>
                  )}
                </div>
              )}
            </div>
          </nav>

          <div className="mt-4 px-1">
            {session ? (
              isCreator ? (
                <Link href="/home?compose=1" className="btn btn-accent btn-lg w-full xl:w-auto xl:min-w-[200px]" title="New post">
                  <Icon name="plus" size={18} className="xl:hidden" />
                  <span className="hidden xl:inline">New post</span>
                </Link>
              ) : (
                <Link href="/studio" className="btn btn-outline btn-lg w-full xl:w-auto xl:min-w-[200px]" title="Become a creator">
                  <Icon name="star" size={18} className="xl:hidden" />
                  <span className="hidden xl:inline">Become a creator</span>
                </Link>
              )
            ) : (
              <button type="button" className="btn btn-accent btn-lg w-full xl:w-auto xl:min-w-[200px]" onClick={() => signIn()} disabled={step !== "idle"} title="Connect wallet">
                <Icon name="wallet" size={18} className="xl:hidden" />
                <span className="hidden xl:inline">{step === "idle" ? "Connect wallet" : "Signing in…"}</span>
              </button>
            )}
          </div>
        </div>

        {me && (
          <Link href={profileHref(me)} className="flex items-center gap-3 rounded-full px-2 py-2 hover:bg-bg-2">
            <Avatar profile={me} size={40} />
            <span className="hidden min-w-0 xl:block">
              <span className="block truncate text-[15px] font-semibold">{displayName(me)}</span>
              <span className="block truncate text-[13px] text-ink-2">{handleOf(me)}</span>
            </span>
          </Link>
        )}
      </aside>

      {/* centre column */}
      <main className={`min-h-dvh w-full min-w-0 flex-1 border-line pb-20 md:border-r md:pb-0 ${wide ? "" : "max-w-[640px]"}`}>{children}</main>

      {/* right column */}
      {right !== null && <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 overflow-y-auto px-5 py-4 scrollbar-none lg:block">{right ?? <RightRail />}</aside>}

      {/* phone bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-line bg-white/95 backdrop-blur md:hidden">
        {(session ? ["/home", "/explore", "/messages", "/notifications"] : ["/explore", "/token"]).map((href) => {
          const item = items.find((i) => i.href === href) ?? { href: "/token", label: "Token", icon: "coin" as IconName };
          return (
            <Link key={href} href={href} className={`relative flex h-12 w-12 items-center justify-center rounded-full ${active(href) ? "text-accent" : "text-ink-2"}`} aria-label={item.label}>
              <Icon name={item.icon} size={26} />
              {item.badge ? <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent" /> : null}
            </Link>
          );
        })}
        {me ? (
          <Link href={profileHref(me)} aria-label="My profile">
            <Avatar profile={me} size={30} />
          </Link>
        ) : (
          <button type="button" onClick={() => signIn()} className="flex h-12 w-12 items-center justify-center text-accent" aria-label="Sign in">
            <Icon name="wallet" size={26} />
          </button>
        )}
      </nav>
    </div>
  );
}

/** Title bar at the top of the centre column, as the reference's sticky header with a back arrow. */
export function ColumnHeader({ title, back, right, sub }: { title: ReactNode; back?: boolean; right?: ReactNode; sub?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur">
      {back && (
        <button type="button" className="icon-btn -ml-2" onClick={() => router.back()} aria-label="Back">
          <Icon name="back" size={22} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold uppercase tracking-[0.02em]">{title}</h1>
        {sub && <div className="truncate text-[12px] text-ink-2">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

/** Content that needs a session shows this instead. */
export function SignInDoor({ what }: { what: string }) {
  const { signIn, step, error } = useSession();
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <MarkImg size={72} />
      <h2 className="mt-5 text-[20px] font-bold">Sign in to see {what}</h2>
      <p className="mt-2 max-w-[360px] text-[14px] text-ink-2">One wallet signature. Your subscriptions, tips and unlocks follow your wallet, not an account.</p>
      <button type="button" className="btn btn-accent btn-lg mt-6" onClick={() => signIn()} disabled={step !== "idle"}>
        <Icon name="wallet" size={18} /> {step === "idle" ? "Connect wallet" : "Signing in…"}
      </button>
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

export function useRequireSession() {
  const { session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session) router.replace("/");
  }, [session, router]);
  return session;
}
