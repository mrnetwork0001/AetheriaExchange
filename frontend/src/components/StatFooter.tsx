"use client";

import { useChainId } from "wagmi";

const STATS = ["PARIMUTUEL SETTLEMENT", "2% FEE ON LOSING POOL", "NON-CUSTODIAL", "AI CO-PILOT"];

export function StatFooter() {
  const chainId = useChainId();

  return (
    <footer className="stat-footer">
      {STATS.map((s) => (
        <span key={s} style={{ display: "flex", alignItems: "center" }}>
          <span className="stat">{s}</span>
          <span className="divider">|</span>
        </span>
      ))}
      <span className="stat">CHAIN {chainId ?? "—"}</span>
    </footer>
  );
}
