import crypto from "crypto";
import { NextResponse } from "next/server";
import { NATIVE_TOKEN, resolveToken } from "@/lib/tokens";

export const runtime = "nodejs";

const OKX_BASE = "https://web3.okx.com";

interface SwapRequest {
  chainId?: number;
  tokenIn?: string; // symbol
  tokenOut?: string; // symbol
  amount?: string; // base units of tokenIn (already scaled by decimals)
  userWallet?: string;
  slippage?: string; // e.g. "0.005"
}

function okxHeaders(method: string, requestPath: string) {
  const key = process.env.OKX_API_KEY!;
  const secret = process.env.OKX_API_SECRET!;
  const passphrase = process.env.OKX_API_PASSPHRASE!;
  const timestamp = new Date().toISOString();
  const sign = crypto
    .createHmac("sha256", secret)
    .update(timestamp + method + requestPath)
    .digest("base64");

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": key,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
  if (process.env.OKX_PROJECT_ID) {
    headers["OK-ACCESS-PROJECT"] = process.env.OKX_PROJECT_ID;
  }
  return headers;
}

export async function POST(req: Request) {
  if (
    !process.env.OKX_API_KEY ||
    !process.env.OKX_API_SECRET ||
    !process.env.OKX_API_PASSPHRASE
  ) {
    return NextResponse.json(
      { unavailable: true, reason: "OKX DEX API credentials not configured" },
      { status: 503 }
    );
  }

  let body: SwapRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { chainId, tokenIn, tokenOut, amount, userWallet } = body;
  if (!chainId || !tokenIn || !tokenOut || !amount || !userWallet) {
    return NextResponse.json(
      { error: "chainId, tokenIn, tokenOut, amount, userWallet are required" },
      { status: 400 }
    );
  }

  const fromToken = resolveToken(tokenIn);
  const toToken = resolveToken(tokenOut);
  if (!fromToken || !toToken) {
    return NextResponse.json({ error: "Unknown token symbol" }, { status: 400 });
  }

  const params = new URLSearchParams({
    chainId: String(chainId),
    fromTokenAddress: fromToken.address,
    toTokenAddress: toToken.address,
    amount,
    slippage: body.slippage ?? "0.005",
    userWalletAddress: userWallet,
  });
  const requestPath = `/api/v5/dex/aggregator/swap?${params.toString()}`;

  try {
    const res = await fetch(`${OKX_BASE}${requestPath}`, {
      method: "GET",
      headers: okxHeaders("GET", requestPath),
      cache: "no-store",
    });
    const json = await res.json();

    if (json.code !== "0" || !json.data?.[0]) {
      return NextResponse.json(
        { error: json.msg ?? "OKX DEX aggregator returned no route", raw: json },
        { status: 502 }
      );
    }

    // ERC-20 inputs are pulled via transferFrom, so the client must hold an
    // allowance for OKX's approval contract. Fetch the spender address here;
    // the client checks/creates the allowance before sending the swap.
    let approval: { spender: string; tokenAddress: string } | null = null;
    if (fromToken.address !== NATIVE_TOKEN) {
      const approveParams = new URLSearchParams({
        chainId: String(chainId),
        tokenContractAddress: fromToken.address,
        approveAmount: amount,
      });
      const approvePath = `/api/v5/dex/aggregator/approve-transaction?${approveParams.toString()}`;
      const approveRes = await fetch(`${OKX_BASE}${approvePath}`, {
        method: "GET",
        headers: okxHeaders("GET", approvePath),
        cache: "no-store",
      });
      const approveJson = await approveRes.json();
      const spender = approveJson.data?.[0]?.dexContractAddress;
      if (approveJson.code !== "0" || !spender) {
        return NextResponse.json(
          {
            error:
              approveJson.msg ??
              "OKX DEX aggregator returned no approval contract for this token",
          },
          { status: 502 }
        );
      }
      approval = { spender, tokenAddress: fromToken.address };
    }

    const { tx, routerResult } = json.data[0];
    return NextResponse.json({
      tx: {
        to: tx.to,
        data: tx.data,
        value: tx.value ?? "0",
        gas: tx.gas,
      },
      approval,
      quote: {
        toTokenAmount: routerResult?.toTokenAmount ?? null,
        estimatedGasFee: routerResult?.estimateGasFee ?? null,
      },
    });
  } catch (err) {
    console.error("OKX DEX swap route error:", err);
    return NextResponse.json(
      { error: "Failed to reach OKX DEX aggregator" },
      { status: 502 }
    );
  }
}
