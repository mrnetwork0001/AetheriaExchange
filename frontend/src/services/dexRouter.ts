import { parseUnits } from "viem";
import { NATIVE_TOKEN, resolveToken } from "@/lib/tokens";
import type { DexTrade } from "@/lib/intent";

// Deep link into the OKX DEX *interface* with the hedge prefilled. Per the
// hackathon FAQ, only interface-executed swaps count toward Launch Grant
// volume (API-executed swaps are excluded) - so this is the grant-eligible
// path. The interface lists mainnet chains only; testnet sessions link to
// the mainnet pair. Prefill params are best-effort: if OKX changes the URL
// scheme the link still lands on the swap page.
export function okxInterfaceUrl(trade: DexTrade, chainId: number): string {
  const interfaceChain = chainId === 1952 ? 196 : chainId;
  const tokenIn = resolveToken(trade.tokenIn);
  const tokenOut = resolveToken(trade.tokenOut);
  const currency = (t: typeof tokenIn, symbol: string) =>
    !t || t.address === NATIVE_TOKEN ? symbol.toUpperCase() : t.address;
  const params = new URLSearchParams({
    inputChain: String(interfaceChain),
    outputChain: String(interfaceChain),
    inputCurrency: currency(tokenIn, trade.tokenIn),
    outputCurrency: currency(tokenOut, trade.tokenOut),
  });
  return `https://web3.okx.com/dex-swap?${params.toString()}`;
}

export interface PreparedSwap {
  tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  };
  // Present for ERC-20 inputs: the OKX approval contract that must hold an
  // allowance before the swap's transferFrom can succeed. null for native OKB.
  approval: {
    spender: `0x${string}`;
    tokenAddress: `0x${string}`;
  } | null;
  amountBaseUnits: string;
  quote: {
    toTokenAmount: string | null;
    estimatedGasFee: string | null;
  };
}

export type SwapPreparation =
  | { status: "ready"; swap: PreparedSwap }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

// Asks our server-side route (which holds the OKX API credentials) for a
// ready-to-sign swap transaction on X Layer via the OKX DEX aggregator.
export async function prepareSwap(
  trade: DexTrade,
  chainId: number,
  userWallet: string
): Promise<SwapPreparation> {
  const tokenIn = resolveToken(trade.tokenIn);
  if (!tokenIn) {
    return { status: "error", reason: `Unknown token ${trade.tokenIn}` };
  }

  let baseUnits: string;
  try {
    baseUnits = parseUnits(trade.amount, tokenIn.decimals).toString();
  } catch {
    return { status: "error", reason: `Invalid amount ${trade.amount}` };
  }

  const res = await fetch("/api/dex/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chainId,
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      amount: baseUnits,
      userWallet,
    }),
  });

  const json = await res.json();

  if (res.status === 503 && json.unavailable) {
    return { status: "unavailable", reason: json.reason };
  }
  if (!res.ok || !json.tx) {
    return { status: "error", reason: json.error ?? "Routing failed" };
  }

  return {
    status: "ready",
    swap: {
      tx: {
        to: json.tx.to,
        data: json.tx.data,
        value: BigInt(json.tx.value ?? "0"),
      },
      approval: json.approval ?? null,
      amountBaseUnits: baseUnits,
      quote: json.quote,
    },
  };
}
