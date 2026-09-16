"use client";

import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError, keccak256, maxUint256, toBytes, type Address, type Hex } from "viem";
import { useConnect, useConnection, usePublicClient, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { curveAbi, erc20Abi, onlyChainAbi } from "@/lib/abi/onlychain";
import { chain, CURVE_ADDRESS, HUB_ADDRESS, TOKEN_ADDRESS } from "@/lib/chain";
import { api } from "@/lib/client/api";

/**
 * Every payment on the site goes through here: connect if needed, switch to
 * the right chain, make sure the hub may spend the amount (one `approve`,
 * exact or unlimited — the "add a card" moment), send the call, wait for
 * the receipt, then tell the server to index that receipt so the page
 * reflects the payment before the next block. Each step is exposed so a
 * button can say what it is doing.
 */

export type PayStep = "idle" | "connecting" | "switching" | "approving" | "paying" | "buying" | "selling" | "sending" | "syncing" | "done";

export type PayAction =
  | { kind: "subscribe"; creator: Address; months: number; cost: bigint }
  | { kind: "tip"; creator: Address; amount: bigint; ref?: string }
  | { kind: "unlock"; creator: Address; contentId: Hex; amount: bigint }
  | { kind: "setPlan"; monthlyPrice: bigint; open: boolean; discount3Bps: number; discount6Bps: number; discount12Bps: number; trialDays: number }
  /** Start a creator's free trial — no token moves. */
  | { kind: "trial"; creator: Address }
  | { kind: "approve"; amount: bigint }
  /** Buy $ONLY with native ETH on the bonding curve. */
  | { kind: "buy"; eth: bigint; minTokensOut: bigint }
  /** Sell $ONLY back to ETH on the curve (approve to the curve, then sell). */
  | { kind: "sell"; tokens: bigint; minEthOut: bigint }
  /** Send $ONLY or ETH to another wallet (an exchange deposit address, a friend). */
  | { kind: "send"; asset: "only" | "eth"; to: Address; amount: bigint };

export const contentIdOf = (kind: "post" | "msg", id: string): Hex => keccak256(toBytes(`${kind}:${id}`));

const REVERTS: Record<string, string> = {
  PlanClosed: "This creator is not accepting subscriptions right now.",
  BadMonths: "Choose between 1 and 12 months.",
  SelfPay: "You cannot pay yourself.",
  TrialUnavailable: "The free trial is not available for this wallet (already used, or you subscribed before).",
  BadPlan: "Discounts go up to 50 % and a trial up to 30 days.",
  ZeroAmount: "The amount must be more than zero.",
  ERC20InsufficientBalance: "Not enough ONLY in your wallet.",
  ERC20InsufficientAllowance: "The hub is not allowed to spend that much — approve first.",
  Slippage: "The price moved — try again.",
  NativeValueMismatch: "The ETH sent did not match the amount.",
  NotEnoughQuote: "The curve does not hold enough ETH for that sale right now — sell less.",
};

export function explainError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name && REVERTS[name]) return REVERTS[name];
    if (/User rejected|denied|rejected the request/i.test(err.shortMessage)) return "Cancelled in the wallet.";
    return err.shortMessage.split("\n")[0].slice(0, 160);
  }
  const msg = (err as Error)?.message ?? String(err);
  if (/User rejected|denied/i.test(msg)) return "Cancelled in the wallet.";
  return msg.split("\n")[0].slice(0, 160);
}

export function usePay() {
  const { address, isConnected, chainId } = useConnection();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const client = usePublicClient();
  const [step, setStep] = useState<PayStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const configured = HUB_ADDRESS !== null && TOKEN_ADDRESS !== null;
  const canBuy = CURVE_ADDRESS !== null;

  const ensureReady = useCallback(async (): Promise<Address> => {
    let account = isConnected ? address : undefined;
    if (!account) {
      setStep("connecting");
      const connector = connectors[0];
      if (!connector) throw new Error("No browser wallet found.");
      const res = await connectAsync({ connector });
      account = res.accounts[0];
    }
    if (!account) throw new Error("The wallet did not return an account.");
    if (chainId !== chain.id) {
      setStep("switching");
      await switchChainAsync({ chainId: chain.id });
    }
    return account;
  }, [address, chainId, connectAsync, connectors, isConnected, switchChainAsync]);

  const pay = useCallback(
    async (action: PayAction, opts: { unlimited?: boolean } = {}): Promise<Hex | null> => {
      setError(null);
      setTxHash(null);
      if (!client) return null;
      if (action.kind === "buy") {
        if (!CURVE_ADDRESS) {
          setError("Buying inside the site is not configured on this deployment (no curve address).");
          return null;
        }
        try {
          const account = await ensureReady();
          setStep("buying");
          const hash = await writeContractAsync({ address: CURVE_ADDRESS, abi: curveAbi, functionName: "buy", args: [action.eth, action.minTokensOut, account], value: action.eth, account, chain });
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The transaction reverted.");
          setTxHash(hash);
          setStep("done");
          return hash;
        } catch (err) {
          setError(explainError(err));
          setStep("idle");
          return null;
        }
      }
      if (action.kind === "sell") {
        if (!CURVE_ADDRESS || !TOKEN_ADDRESS) {
          setError("Selling inside the site is not configured on this deployment (no curve address).");
          return null;
        }
        try {
          const account = await ensureReady();
          const allowance = await client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [account, CURVE_ADDRESS] });
          if (allowance < action.tokens) {
            setStep("approving");
            const a = await writeContractAsync({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "approve", args: [CURVE_ADDRESS, action.tokens], account, chain });
            await client.waitForTransactionReceipt({ hash: a });
          }
          setStep("selling");
          const hash = await writeContractAsync({ address: CURVE_ADDRESS, abi: curveAbi, functionName: "sell", args: [action.tokens, action.minEthOut, account], account, chain });
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The transaction reverted.");
          setTxHash(hash);
          setStep("done");
          return hash;
        } catch (err) {
          setError(explainError(err));
          setStep("idle");
          return null;
        }
      }
      if (action.kind === "send") {
        try {
          const account = await ensureReady();
          setStep("sending");
          let hash: Hex;
          if (action.asset === "eth") hash = await sendTransactionAsync({ to: action.to, value: action.amount, account, chainId: chain.id });
          else {
            if (!TOKEN_ADDRESS) throw new Error("No token configured.");
            hash = await writeContractAsync({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [action.to, action.amount], account, chain });
          }
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The transaction reverted.");
          setTxHash(hash);
          setStep("done");
          return hash;
        } catch (err) {
          setError(explainError(err));
          setStep("idle");
          return null;
        }
      }
      if (!configured) {
        setError("Payments are not configured on this deployment (no hub address).");
        return null;
      }
      try {
        const account = await ensureReady();
        const hub = HUB_ADDRESS!;
        const token = TOKEN_ADDRESS!;

        const needs = action.kind === "subscribe" ? action.cost : action.kind === "tip" || action.kind === "unlock" ? action.amount : 0n;
        if (action.kind === "approve") {
          setStep("approving");
          const hash = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [hub, action.amount], account, chain });
          await client.waitForTransactionReceipt({ hash });
          setTxHash(hash);
          setStep("done");
          return hash;
        }
        if (needs > 0n) {
          const [balance, allowance] = await Promise.all([
            client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
            client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account, hub] }),
          ]);
          if (balance < needs) throw new Error(REVERTS.ERC20InsufficientBalance);
          if (allowance < needs) {
            setStep("approving");
            const hash = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [hub, opts.unlimited ? maxUint256 : needs], account, chain });
            await client.waitForTransactionReceipt({ hash });
          }
        }

        setStep("paying");
        let hash: Hex;
        switch (action.kind) {
          case "subscribe":
            hash = await writeContractAsync({ address: hub, abi: onlyChainAbi, functionName: "subscribe", args: [action.creator, action.months], account, chain });
            break;
          case "tip":
            hash = await writeContractAsync({ address: hub, abi: onlyChainAbi, functionName: "tip", args: [action.creator, action.amount, (action.ref ?? `0x${"0".repeat(64)}`) as Hex], account, chain });
            break;
          case "unlock":
            hash = await writeContractAsync({ address: hub, abi: onlyChainAbi, functionName: "unlock", args: [action.creator, action.contentId, action.amount], account, chain });
            break;
          case "setPlan":
            hash = await writeContractAsync({ address: hub, abi: onlyChainAbi, functionName: "setPlan", args: [action.monthlyPrice, action.open, action.discount3Bps, action.discount6Bps, action.discount12Bps, action.trialDays], account, chain });
            break;
          case "trial":
            hash = await writeContractAsync({ address: hub, abi: onlyChainAbi, functionName: "startTrial", args: [action.creator], account, chain });
            break;
          default:
            throw new Error("Unknown action.");
        }
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction reverted.");
        setTxHash(hash);
        setStep("syncing");
        await api("/api/chain/sync", { body: { txHash: hash } }).catch(() => null);
        setStep("done");
        return hash;
      } catch (err) {
        setError(explainError(err));
        setStep("idle");
        return null;
      }
    },
    [client, configured, ensureReady, sendTransactionAsync, writeContractAsync],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }, []);

  return { pay, step, error, txHash, reset, configured, canBuy, busy: step !== "idle" && step !== "done" };
}

export const STEP_LABEL: Record<PayStep, string> = {
  idle: "",
  connecting: "Connecting wallet…",
  switching: "Switching network…",
  approving: "Approve ONLY in your wallet…",
  paying: "Confirm in your wallet…",
  buying: "Confirm the purchase in your wallet…",
  selling: "Confirm the sale in your wallet…",
  sending: "Confirm the transfer in your wallet…",
  syncing: "Confirmed — updating…",
  done: "Done",
};
