"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, useSignMessage, useSwitchChain, type Connector } from "wagmi";
import { chain } from "@/lib/chain";
import { signInMessage } from "@/lib/signin";
import type { Profile, Session } from "@/lib/model";

/**
 * The signed-in identity, shared by every screen. The server's cookie is the
 * source of truth; this context mirrors it, and `signIn` walks the wallet
 * through connect → sign → verify with each step's failure shown, never
 * swallowed.
 */

export type SessionValue = { session: Session | null; profile: Profile | null; unread: number; ops: boolean };

type Step = "idle" | "connecting" | "signing" | "verifying";

type Ctx = SessionValue & {
  step: Step;
  error: string | null;
  walletAvailable: boolean;
  /** Wallets worth listing: every announced browser wallet, WalletConnect if configured, the bare injected fallback only when nothing announced itself. */
  wallets: Connector[];
  connectOpen: boolean;
  closeConnect: () => void;
  /** Connect (with the given wallet, the only one, or after asking which) → sign → verify. Resolves true once the cookie is set. */
  signIn: (connector?: Connector) => Promise<boolean>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setProfile: (p: Profile) => void;
};

const SessionContext = createContext<Ctx | null>(null);

/** Is there actually a wallet in this browser? wagmi's injected connector is always registered, so its presence says nothing. */
function useWalletAvailable(): boolean {
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    let found = typeof window !== "undefined" && "ethereum" in window;
    const onAnnounce = () => {
      found = true;
      setAvailable(true);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = window.setTimeout(() => setAvailable(found), 400);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);
  return available;
}

export function SessionProvider({ initial, children }: { initial: SessionValue; children: ReactNode }) {
  const [value, setValue] = useState<SessionValue>(initial);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const walletAvailable = useWalletAvailable();
  const [connectOpen, setConnectOpen] = useState(false);

  const { address, isConnected, chainId } = useConnection();
  const { connectAsync } = useConnect();
  const connectors = useConnectors();
  const wallets = useMemo(() => {
    const announced = connectors.filter((c) => c.id !== "injected" && c.id !== "walletConnect");
    const wc = connectors.filter((c) => c.id === "walletConnect");
    const bare = connectors.filter((c) => c.id === "injected");
    return [...announced, ...(announced.length === 0 ? bare : []), ...wc];
  }, [connectors]);
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (res.ok) setValue((await res.json()) as SessionValue);
  }, []);

  const signIn = useCallback(
    async (chosen?: Connector): Promise<boolean> => {
    setError(null);
    try {
      let account = isConnected ? address : undefined;
      if (!account) {
        let connector = chosen;
        if (!connector) {
          const usable = wallets.filter((w) => w.id === "walletConnect" || walletAvailable);
          if (usable.length !== 1) {
            // nothing found (the dialog shows how to install one) or several: ask
            setConnectOpen(true); // the dialog calls signIn(connector) with the pick
            return false;
          }
          connector = usable[0];
        }
        setConnectOpen(false);
        setStep("connecting");
        const result = await connectAsync({ connector });
        account = result.accounts[0];
      }
      if (!account) throw new Error("The wallet did not return an account.");
      if (chainId !== undefined && chainId !== chain.id) {
        try {
          await switchChainAsync({ chainId: chain.id });
        } catch {
          // Signing does not need the right chain; only transactions do.
        }
      }
      setStep("signing");
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      if (!nonceRes.ok) throw new Error("Could not start a sign-in — the server refused a nonce.");
      const { nonce, issuedAt } = (await nonceRes.json()) as { nonce: string; issuedAt: string };
      const message = signInMessage(account, nonce, issuedAt);
      const signature = await signMessageAsync({ account, message });
      setStep("verifying");
      const verify = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account, nonce, issuedAt, signature }),
      });
      const body = (await verify.json()) as { error?: string };
      if (!verify.ok) throw new Error(body.error ?? "Sign-in was refused.");
      await refresh();
      return true;
    } catch (err) {
      const msg = (err as Error).message ?? "Sign-in failed.";
      setError(msg.split("\n")[0].slice(0, 160));
      return false;
    } finally {
      setStep("idle");
    }
    },
    [address, chainId, connectAsync, isConnected, refresh, signMessageAsync, switchChainAsync, walletAvailable, wallets],
  );

  const closeConnect = useCallback(() => setConnectOpen(false), []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    try {
      await disconnectAsync();
    } catch {
      /* already disconnected */
    }
    setValue({ session: null, profile: null, unread: 0, ops: false });
  }, [disconnectAsync]);

  const setProfile = useCallback((p: Profile) => setValue((v) => ({ ...v, profile: p })), []);

  // If the wallet switches to another account, the cookie is for the old one: drop it rather than let two identities blur.
  const lastAddress = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!address) return;
    if (lastAddress.current && lastAddress.current !== address && value.session) void signOut();
    lastAddress.current = address;
  }, [address, signOut, value.session]);

  const ctx = useMemo<Ctx>(
    () => ({ ...value, step, error, walletAvailable, wallets, connectOpen, closeConnect, signIn, signOut, refresh, setProfile }),
    [value, step, error, walletAvailable, wallets, connectOpen, closeConnect, signIn, signOut, refresh, setProfile],
  );

  return <SessionContext.Provider value={ctx}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
