import { NextResponse } from "next/server";
import { createPublicClient, formatEther, http } from "viem";
import { xLayer, xLayerTestnet } from "@/lib/chains";
import { contractAddress, outcomeMarketAbi } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public read API for the live markets - consumed by the Telegram bot and
// any external integration. Reads the chain server-side; no keys involved.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("chainId") ?? "");
  const chain =
    requested === xLayer.id
      ? xLayer
      : requested === xLayerTestnet.id
        ? xLayerTestnet
        : contractAddress(xLayerTestnet.id)
          ? xLayerTestnet
          : xLayer;

  const venue = contractAddress(chain.id);
  if (!venue) {
    return NextResponse.json(
      { error: `No venue deployed on chain ${chain.id}` },
      { status: 404 }
    );
  }

  const client = createPublicClient({ chain, transport: http() });
  const abi = outcomeMarketAbi as any;

  try {
    const count = Number(
      await client.readContract({
        address: venue,
        abi,
        functionName: "marketCount",
      })
    );

    const markets = [];
    for (let id = 0; id < count; id++) {
      const m: any = await client.readContract({
        address: venue,
        abi,
        functionName: "getMarket",
        args: [BigInt(id)],
      });
      const yes = BigInt(m.yesPool);
      const no = BigInt(m.noPool);
      const total = yes + no;
      markets.push({
        id,
        title: m.title,
        category: m.category,
        endTime: Number(m.endTime),
        status: Number(m.status),
        outcome: m.outcome,
        yesPoolOkb: formatEther(yes),
        noPoolOkb: formatEther(no),
        yesPct: total === 0n ? 50 : Number((yes * 100n) / total),
      });
    }

    return NextResponse.json({ chainId: chain.id, venue, markets });
  } catch (err) {
    console.error("markets API error:", err);
    return NextResponse.json(
      { error: "Failed to read markets from chain" },
      { status: 502 }
    );
  }
}
