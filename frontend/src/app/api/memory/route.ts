import { NextResponse } from "next/server";

export const runtime = "nodejs";
// 0G Storage uploads are network-bound and can be slow.
export const maxDuration = 60;

export const dynamic = "force-dynamic";

// 0G Storage sync for co-pilot memory. The client keeps localStorage as the
// hot store and pushes encrypted snapshots here; this route persists them as
// blobs on 0G's decentralized storage network and returns the root hash the
// client keeps as its pointer. Blobs arrive already encrypted client-side -
// this server (and 0G) only ever see ciphertext.
//
// Env (server-side):
//   ZG_STORAGE_PRIVATE_KEY   funded 0G-testnet wallet that pays storage fees
//   ZG_STORAGE_RPC           default https://evmrpc-testnet.0g.ai
//   ZG_STORAGE_INDEXER       default https://indexer-storage-testnet-turbo.0g.ai
// Without the key the route reports unavailable and the client stays
// local-only - graceful degradation, no broken UX.

const RPC = process.env.ZG_STORAGE_RPC ?? "https://evmrpc-testnet.0g.ai";
const INDEXER =
  process.env.ZG_STORAGE_INDEXER ??
  "https://indexer-storage-testnet-turbo.0g.ai";
const MAX_BLOB_BYTES = 256 * 1024;

// Uploads spend real fees from the server's 0G wallet, so anonymous callers
// are budgeted: per-IP hourly limit plus a global daily cap. In-memory, so
// per-instance on serverless hosts - a bound on abuse, not a billing system.
const IP_LIMIT_PER_HOUR = 12;
const GLOBAL_LIMIT_PER_DAY = 300;
const ipWindows = new Map<string, { count: number; windowStart: number }>();
let globalWindow = { count: 0, windowStart: Date.now() };

function uploadAllowed(req: Request): boolean {
  const now = Date.now();
  if (now - globalWindow.windowStart > 24 * 3600_000) {
    globalWindow = { count: 0, windowStart: now };
  }
  if (globalWindow.count >= GLOBAL_LIMIT_PER_DAY) return false;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const entry = ipWindows.get(ip);
  if (!entry || now - entry.windowStart > 3600_000) {
    ipWindows.set(ip, { count: 1, windowStart: now });
  } else {
    if (entry.count >= IP_LIMIT_PER_HOUR) return false;
    entry.count++;
  }
  if (ipWindows.size > 10_000) ipWindows.clear(); // memory bound

  globalWindow.count++;
  return true;
}

function available(): boolean {
  return !!process.env.ZG_STORAGE_PRIVATE_KEY;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.has("probe")) {
    return NextResponse.json({ available: available() });
  }

  if (!available()) {
    return NextResponse.json({ unavailable: true }, { status: 501 });
  }

  const root = url.searchParams.get("root");
  if (!root || !/^0x[0-9a-fA-F]{64}$/.test(root)) {
    return NextResponse.json({ error: "Missing or invalid root" }, { status: 400 });
  }

  try {
    const { Indexer } = await import("@0gfoundation/0g-storage-ts-sdk");
    const indexer = new Indexer(INDEXER);
    const [blob, err] = await indexer.downloadToBlob(root);
    if (err || !blob) {
      return NextResponse.json(
        { error: `Download failed: ${err?.message ?? "no data"}` },
        { status: 502 }
      );
    }
    const bytes = Buffer.from(await blob.arrayBuffer());
    return NextResponse.json({ blob: bytes.toString("base64") });
  } catch (err: any) {
    console.error("0G memory download error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!available()) {
    return NextResponse.json({ unavailable: true }, { status: 501 });
  }

  if (!uploadAllowed(req)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: { blob?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.blob || typeof body.blob !== "string") {
    return NextResponse.json({ error: "Missing blob" }, { status: 400 });
  }

  const bytes = Buffer.from(body.blob, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BLOB_BYTES) {
    return NextResponse.json({ error: "Blob empty or too large" }, { status: 400 });
  }

  try {
    const [{ Indexer, MemData }, { ethers }] = await Promise.all([
      import("@0gfoundation/0g-storage-ts-sdk"),
      import("ethers"),
    ]);
    const provider = new ethers.JsonRpcProvider(RPC);
    const signer = new ethers.Wallet(process.env.ZG_STORAGE_PRIVATE_KEY!, provider);
    const indexer = new Indexer(INDEXER);

    const file = new MemData(new Uint8Array(bytes));
    const [result, err] = await indexer.upload(file, RPC, signer);
    if (err) {
      return NextResponse.json(
        { error: `Upload failed: ${err.message}` },
        { status: 502 }
      );
    }
    const rootHash =
      result && "rootHash" in result ? result.rootHash : result?.rootHashes?.[0];
    if (!rootHash) {
      return NextResponse.json({ error: "Upload returned no root" }, { status: 502 });
    }
    return NextResponse.json({ rootHash });
  } catch (err: any) {
    console.error("0G memory upload error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Upload failed" },
      { status: 502 }
    );
  }
}
