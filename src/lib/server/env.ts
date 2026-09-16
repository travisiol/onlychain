import "server-only";
import { isAddress, type Address } from "viem";

/**
 * The server's view of the chain, read at request time (never inlined):
 * ONLYCHAIN_* first, then the NEXT_PUBLIC_* values the browser also uses.
 */
export type ServerChainEnv = {
  chainId: number;
  rpcUrl: string;
  hub: Address | null;
  token: Address | null;
};

function addr(v: string | undefined): Address | null {
  const s = v?.trim();
  return s && isAddress(s) ? (s as Address) : null;
}

export function serverChainEnv(): ServerChainEnv {
  const chainId = Number(process.env.ONLYCHAIN_CHAIN_ID || process.env.NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID || 4663);
  const rpcUrl =
    process.env.ONLYCHAIN_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_ONLYCHAIN_RPC_URL?.trim() ||
    (chainId === 31337 ? "http://127.0.0.1:8766" : "https://rpc.mainnet.chain.robinhood.com");
  return {
    chainId,
    rpcUrl,
    hub: addr(process.env.ONLYCHAIN_HUB) ?? addr(process.env.NEXT_PUBLIC_ONLYCHAIN_HUB),
    token: addr(process.env.ONLYCHAIN_TOKEN) ?? addr(process.env.NEXT_PUBLIC_ONLYCHAIN_TOKEN),
  };
}
