"use client";

import { useChainId } from "wagmi";
import { contractAddress } from "@/lib/contract";

const STATS = ["PARIMUTUEL SETTLEMENT", "2% FEE ON LOSING POOL", "NON-CUSTODIAL", "AI CO-PILOT"];

const LINKS = [
  { text: "GITHUB ↗", href: "https://github.com/mrnetwork0001/AetheriaExchange" },
  { text: "EXPLORER ↗", href: "https://www.oklink.com/xlayer-test" },
  { text: "@AETHERIAEX ↗", href: "https://x.com/AetheriaEx" },
];

export function StatFooter() {
  const chainId = useChainId();
  const venue = contractAddress(chainId);

  return (
    <footer className="site-footer">
      <div className="footer-links">
        {LINKS.map((l) => (
          <a key={l.text} className="footer-link" href={l.href} target="_blank" rel="noreferrer">
            {l.text}
          </a>
        ))}
        <span className="footer-link footer-venue">
          VENUE:{" "}
          {venue ? `${venue.slice(0, 8)}…${venue.slice(-6)}` : "DEPLOYING TO TESTNET"}
        </span>
      </div>
      <div className="stat-footer">
        {STATS.map((s) => (
          <span key={s} style={{ display: "flex", alignItems: "center" }}>
            <span className="stat">{s}</span>
            <span className="divider">|</span>
          </span>
        ))}
        <span className="stat">CHAIN {chainId ?? "—"}</span>
      </div>
    </footer>
  );
}
