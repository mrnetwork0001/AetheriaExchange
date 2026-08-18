"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Receipt {
  id: number;
  title: string;
  category: string;
  endTime: number;
  kind: "resolved" | "refunded";
  outcome: boolean | null;
  yesPoolOkb: string;
  noPoolOkb: string;
  winnersMultiple?: string | null;
  refundedOkb?: string;
  tx: string | null;
  txUrl: string | null;
  settledAt: number | null;
  resolverLog: string | null;
}

interface ZeroStake {
  id: number;
  title: string;
  txUrl: string | null;
}

interface ReceiptsPayload {
  chainId: number;
  venue: string;
  indexing: boolean;
  progress: number;
  counts: {
    resolved: number;
    refunded: number;
    zeroStakeCancelled: number;
    open: number;
  };
  receipts: Receipt[];
  zeroStakeCancelled: ZeroStake[];
  error?: string;
}

function okb(v: string): string {
  const n = Number(v);
  if (n === 0) return "0";
  if (n < 0.001) return n.toPrecision(2);
  return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function when(r: Receipt): string {
  const t = r.settledAt ?? r.endTime;
  return new Date(t * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ") + " UTC";
}

export function ReceiptsView() {
  const [data, setData] = useState<ReceiptsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/receipts", { cache: "no-store" });
        const json = (await res.json()) as ReceiptsPayload;
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? "request failed");
        setData(json);
        setFailed(false);
        // While the backfill sweep is behind the chain head, each request
        // advances it - keep polling until the index is caught up.
        if (json.indexing) {
          timer.current = setTimeout(load, 1500);
        }
      } catch {
        // Transient chain/RPC hiccups shouldn't dead-end the page.
        if (!cancelled) {
          setFailed(true);
          timer.current = setTimeout(load, 5000);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="receipts-shell">
      <header className="docs-header">
        <Link href="/" className="docs-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aetheria-header.png" alt="Aetheria Exchange" />
        </Link>
        <nav className="docs-header-links">
          <Link href="/">APP</Link>
          <Link href="/?tab=agents">AGENT OPS</Link>
          <Link href="/docs">DOCS</Link>
        </nav>
      </header>

      <main className="receipts-main">
        <span className="label">ONCHAIN AUDIT TRAIL</span>
        <h1 className="receipts-title">Settlement receipts</h1>
        <p className="receipts-sub">
          Every market on Aetheria ends in a transaction: a resolution that
          pays winners from the losing pool, or a cancellation that refunds
          every stake. Nothing here is self-reported - each receipt links to
          the settling transaction on OKLink.
        </p>

        {failed && (
          <div className="receipts-note">
            COULD NOT REACH THE CHAIN - RETRY IN A MOMENT
          </div>
        )}

        {!data && !failed && (
          <div className="receipts-note">READING THE VENUE…</div>
        )}

        {data && (
          <>
            <div className="receipts-stats">
              <span>
                <b>{data.counts.resolved}</b> SETTLED
              </span>
              <span>
                <b>{data.counts.refunded}</b> REFUNDED
              </span>
              <span>
                <b>{data.counts.open}</b> LIVE NOW
              </span>
              {data.indexing && (
                <span className="receipts-indexing">
                  INDEXING TX HISTORY… {data.progress}%
                </span>
              )}
            </div>

            <div className="receipts-list">
              {data.receipts.map((r) => (
                <article key={r.id} className="receipt-card">
                  <div className="receipt-head">
                    <span className="receipt-meta">
                      #{r.id} · {r.category.toUpperCase()} · {when(r)}
                    </span>
                    {r.kind === "resolved" ? (
                      <span
                        className={`receipt-chip ${r.outcome ? "yes" : "no"}`}
                      >
                        {r.outcome ? "RESOLVED YES" : "RESOLVED NO"}
                      </span>
                    ) : (
                      <span className="receipt-chip refund">REFUNDED</span>
                    )}
                  </div>

                  <h2 className="receipt-title">{r.title}</h2>

                  <div className="receipt-figures">
                    <span>
                      YES {okb(r.yesPoolOkb)} OKB · NO {okb(r.noPoolOkb)} OKB
                    </span>
                    {r.kind === "resolved" && r.winnersMultiple && (
                      <span className="receipt-mult">
                        WINNERS PAID {r.winnersMultiple}x
                      </span>
                    )}
                    {r.kind === "refunded" && (
                      <span className="receipt-mult">
                        {okb(r.refundedOkb ?? "0")} OKB RETURNED IN FULL
                      </span>
                    )}
                  </div>

                  {r.resolverLog && (
                    <div className="receipt-log">
                      <span className="label">RESOLVER LOG</span>
                      <span>{r.resolverLog}</span>
                    </div>
                  )}

                  <div className="receipt-verify">
                    {r.txUrl ? (
                      <a href={r.txUrl} target="_blank" rel="noreferrer">
                        VERIFY ON OKLINK ↗
                      </a>
                    ) : data.indexing ? (
                      <span className="receipt-pending">LOCATING TX…</span>
                    ) : (
                      <span className="receipt-pending">
                        TX NOT INDEXED YET
                      </span>
                    )}
                  </div>
                </article>
              ))}

              {data.receipts.length === 0 && (
                <div className="receipts-note">
                  NO SETTLEMENTS YET - MARKETS ARE STILL TRADING
                </div>
              )}
            </div>

            {data.zeroStakeCancelled.length > 0 && (
              <details className="receipts-zero">
                <summary>
                  + {data.zeroStakeCancelled.length} MARKET
                  {data.zeroStakeCancelled.length === 1 ? "" : "S"} CANCELLED
                  WITH ZERO STAKE - NO FUNDS WERE INVOLVED
                </summary>
                <ul>
                  {data.zeroStakeCancelled.map((z) => (
                    <li key={z.id}>
                      <span>
                        #{z.id} · {z.title}
                      </span>
                      {z.txUrl && (
                        <a href={z.txUrl} target="_blank" rel="noreferrer">
                          TX ↗
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="receipts-foot">
              VENUE {data.venue.slice(0, 10)}…{data.venue.slice(-8)} · CHAIN{" "}
              {data.chainId} · PARIMUTUEL - WINNERS ARE PAID FROM THE LOSING
              POOL, NEVER BY THE HOUSE
            </p>
          </>
        )}
      </main>
    </div>
  );
}
