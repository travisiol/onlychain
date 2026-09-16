import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { chain } from "@/lib/chain";
import { site } from "@/lib/site";

/**
 * Wallets: every browser wallet that announces itself (EIP-6963 — MetaMask,
 * Rabby, Coinbase Wallet, Phantom, OKX, Rainbow…) is discovered by wagmi
 * and listed by name and icon; `injected()` is the fallback for one that
 * only sets window.ethereum. WalletConnect (mobile wallets by QR / deep
 * link) is added when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set — a free
 * id from cloud.reown.com.
 */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    injected(),
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: { name: site.name, description: site.description, url: site.url, icons: [`${site.url}/brand/mark-light.png`] },
          }),
        ]
      : []),
  ],
  transports: { [chain.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
