import { site } from "@/lib/site";

/**
 * The exact text a wallet is asked to sign. Built on the client to show and
 * sign, rebuilt on the server to verify — one function, imported by both.
 */
export function signInMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    `${site.name} wants you to sign in with your wallet.`,
    ``,
    `This request will not trigger a transaction or cost any gas.`,
    `By signing you confirm you are ${site.minAge} or older.`,
    ``,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}
