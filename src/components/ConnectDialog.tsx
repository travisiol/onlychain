"use client";

import { Dialog } from "@/components/pay/Dialog";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { site } from "@/lib/site";

/**
 * "Which wallet?" — shown only when there is a choice (two browser wallets,
 * or one plus WalletConnect). Icons and names come from the wallets
 * themselves (EIP-6963); nothing is hard-coded.
 */
const INSTALL = [
  { name: "MetaMask", url: "https://metamask.io/download/", note: "Browser extension and mobile app" },
  { name: "Rabby", url: "https://rabby.io/", note: "Browser extension" },
  { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet/downloads", note: "Extension and mobile app" },
];

export function ConnectDialog() {
  const { connectOpen, closeConnect, wallets, walletAvailable, signIn, step, error } = useSession();
  const usable = wallets.filter((w) => w.id === "walletConnect" || walletAvailable);
  return (
    <Dialog open={connectOpen} onClose={closeConnect} title="Connect a wallet" width={400}>
      <p className="text-[13px] text-ink-2">Your wallet is your account. You will sign one message — no gas, no password, no email.</p>
      {usable.length === 0 && (
        <div className="mt-4">
          <p className="text-[14px] font-semibold">No wallet in this browser yet</p>
          <p className="mt-1 text-[13px] text-ink-2">Install one, put some ${site.token.symbol} (or ETH to buy it here) in it, then reload this page.</p>
          <ul className="mt-3 space-y-2">
            {INSTALL.map((w) => (
              <li key={w.name}>
                <a href={w.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[10px] border border-line-2 px-4 py-3 hover:bg-bg-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                    <Icon name="wallet" size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{w.name}</span>
                    <span className="block text-[12px] text-ink-2">{w.note}</span>
                  </span>
                  <Icon name="external" size={16} className="text-ink-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {usable.map((w) => {
          const isWc = w.id === "walletConnect";
          return (
            <li key={w.uid}>
              <button type="button" className="flex w-full items-center gap-3 rounded-[10px] border border-line-2 px-4 py-3 text-left transition-colors hover:bg-bg-2 disabled:opacity-60" onClick={() => signIn(w)} disabled={step !== "idle"}>
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
                    <Icon name={isWc ? "link" : "wallet"} size={16} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{isWc ? "WalletConnect" : w.name === "Injected" ? "Browser wallet" : w.name}</span>
                  <span className="block text-[12px] text-ink-2">{isWc ? "Mobile wallets — scan a QR code" : "Browser extension"}</span>
                </span>
                <Icon name="chevron" size={16} className="text-ink-3" />
              </button>
            </li>
          );
        })}
      </ul>
      {step !== "idle" && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
          <Icon name="spinner" size={14} className="spin" /> {step === "connecting" ? "Connecting…" : step === "signing" ? "Sign the message in your wallet…" : "Verifying…"}
        </p>
      )}
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      <p className="mt-4 text-[12px] text-ink-3">Creating a page or paying a creator needs no identity, only a wallet. ${site.token.symbol} can be bought with ETH from the Wallet page.</p>
    </Dialog>
  );
}
