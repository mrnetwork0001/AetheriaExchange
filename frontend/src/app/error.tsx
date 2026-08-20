"use client";

import { explorerAddressUrl, explorerBaseUrl } from "@/lib/chains";
import { contractAddress } from "@/lib/contract";

// Last line of defence. Without this, any uncaught render error replaces the
// whole venue with Next's bare "Application error" text - a total loss of
// the page for what is usually a recoverable component fault. Kept to pure
// imports - no hooks, no fetches - so this page cannot fail the same way the
// one it is rescuing did.
const VENUE_CHAIN = contractAddress(196) ? 196 : 1952;
const VENUE = contractAddress(VENUE_CHAIN);

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="shell">
      <section className="hero" style={{ paddingTop: 80 }}>
        <span className="label">SOMETHING BROKE</span>
        <h1>
          The interface hit an error.
          <br />
          <span className="dim">Your funds are untouched.</span>
        </h1>
        <p
          style={{
            color: "var(--dim)",
            maxWidth: 560,
            marginTop: 18,
            lineHeight: 1.6,
          }}
        >
          Nothing here custodies your assets - every position lives in the
          venue contract on X Layer and is claimable regardless of what this
          page does. Reload to carry on.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
          <button className="connect-btn" onClick={reset}>
            RELOAD THE APP
          </button>
          <a
            className="chip"
            style={{ display: "inline-flex", alignItems: "center" }}
            href={
              VENUE
                ? explorerAddressUrl(VENUE_CHAIN, VENUE)
                : explorerBaseUrl(VENUE_CHAIN)
            }
            target="_blank"
            rel="noreferrer"
          >
            VIEW THE VENUE CONTRACT ↗
          </a>
        </div>
        {error?.digest && (
          <p
            className="footer-copy"
            style={{ textAlign: "left", marginTop: 26 }}
          >
            REFERENCE {error.digest}
          </p>
        )}
      </section>
    </div>
  );
}
