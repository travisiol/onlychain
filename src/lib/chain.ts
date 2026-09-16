import { defineChain, isAddress, type Address, type Chain } from "viem";

/**
 * The chain payments happen on. Robinhood Chain (id 4663) by default; the
 * local Hardhat node (id 31337) when NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID says so.
 * The browser's values are inlined at build time; the server reads its own
 * (ONLYCHAIN_CHAIN_ID / ONLYCHAIN_RPC_URL / ONLYCHAIN_HUB / ONLYCHAIN_TOKEN)
 * at runtime and falls back to the public ones.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID ?? 4663);

const ROBINHOOD_RPC = process.env.NEXT_PUBLIC_ONLYCHAIN_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_EXPLORER = (process.env.NEXT_PUBLIC_ONLYCHAIN_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com").replace(/\/$/, "");

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC] } },
  blockExplorers: { default: { name: "Robinhood Chain Explorer", url: ROBINHOOD_EXPLORER } },
  contracts: { multicall3: { address: MULTICALL3 } },
  testnet: false,
});

export const localChain = defineChain({
  id: 31337,
  name: "Local Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ONLYCHAIN_RPC_URL ?? "http://127.0.0.1:8766"] } },
  // The seed script puts Multicall3's real bytecode at the canonical address, so batched reads work here too.
  contracts: { multicall3: { address: MULTICALL3 } },
  testnet: true,
});

export function chainFor(id: number, rpcUrl?: string): Chain {
  const base = id === localChain.id ? localChain : robinhoodChain;
  if (!rpcUrl) return base;
  return { ...base, rpcUrls: { default: { http: [rpcUrl] } } };
}

/** The browser's chain. */
export const chain: Chain = chainFor(CHAIN_ID);

function addressEnv(value: string | undefined): Address | null {
  const v = value?.trim();
  return v && isAddress(v) ? (v as Address) : null;
}

/** Contract addresses as the browser sees them (build-time). `null` = not configured: every pay button says so. */
export const HUB_ADDRESS = addressEnv(process.env.NEXT_PUBLIC_ONLYCHAIN_HUB);
export const TOKEN_ADDRESS = addressEnv(process.env.NEXT_PUBLIC_ONLYCHAIN_TOKEN);
/** The bonding curve $ONLY trades on — lets the site sell $ONLY for ETH. `null` = link out instead. */
export const CURVE_ADDRESS = addressEnv(process.env.NEXT_PUBLIC_ONLYCHAIN_CURVE);

export function explorerTx(hash: string): string | null {
  const base = chain.blockExplorers?.default.url;
  return base && chain.id !== localChain.id ? `${base}/tx/${hash}` : null;
}

export function explorerAddress(address: string): string | null {
  const base = chain.blockExplorers?.default.url;
  return base && chain.id !== localChain.id ? `${base}/address/${address}` : null;
}
