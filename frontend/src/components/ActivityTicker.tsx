"use client";

import type { ActivityItem } from "@/hooks/useActivity";

const KIND_CLASS: Record<string, string> = {
  BET: "",
  NEW: "t-new",
  RESOLVED: "t-res",
  CANCELLED: "t-res",
};

export function ActivityTicker({
  items,
  onSelect,
}: {
  items: ActivityItem[];
  onSelect: (marketId: number) => void;
}) {
  if (items.length === 0) return null;
  // Track is duplicated for a seamless marquee loop.
  const loop = [...items, ...items];

  return (
    <div className="ticker" aria-label="Live venue activity">
      <div
        className="ticker-track"
        style={{ animationDuration: `${Math.max(24, items.length * 5)}s` }}
      >
        {loop.map((item, i) => (
          <button
            key={`${item.id}-${i}`}
            className={`ticker-item ${KIND_CLASS[item.kind] ?? ""} ${
              item.text.includes(" YES ") ? "t-yes" : item.text.includes(" NO ") ? "t-no" : ""
            }`}
            onClick={() => item.marketId !== null && onSelect(item.marketId)}
            tabIndex={-1}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
