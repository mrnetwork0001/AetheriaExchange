import config from "@/contracts/config.json";

export type MarketStatus = 0 | 1 | 2; // Open | Resolved | Cancelled

export interface Market {
  id: number;
  title: string;
  category: string;
  endTime: number;
  status: MarketStatus;
  outcome: boolean;
  yesPool: bigint;
  noPool: bigint;
  live: boolean; // false = demo preview (no contract deployed on this chain)
}

export const outcomeMarketAbi = config.abi;

export function contractAddress(chainId: number | undefined): `0x${string}` | null {
  if (!chainId) return null;
  const chains = config.chains as Record<string, { address: string }>;
  const address = chains[String(chainId)]?.address;
  return address && address.length === 42 ? (address as `0x${string}`) : null;
}

// Shown while no contract is deployed on the connected chain, so the full
// user journey stays demoable. Clearly badged OFFLINE PREVIEW in the UI.
export const DEMO_MARKETS: Market[] = [
  {
    id: 0,
    title: "BTC trades above $150K before Dec 31, 2026",
    category: "CRYPTO",
    endTime: Math.floor(Date.now() / 1000) + 30 * 86400,
    status: 0,
    outcome: false,
    yesPool: 4_200_000_000_000_000_000n,
    noPool: 2_800_000_000_000_000_000n,
    live: false,
  },
  {
    id: 1,
    title: "Fed cuts rates at the September FOMC meeting",
    category: "MACRO",
    endTime: Math.floor(Date.now() / 1000) + 14 * 86400,
    status: 0,
    outcome: false,
    yesPool: 1_500_000_000_000_000_000n,
    noPool: 3_500_000_000_000_000_000n,
    live: false,
  },
  {
    id: 2,
    title: "Nigeria wins their next World Cup qualifier",
    category: "SPORTS",
    endTime: Math.floor(Date.now() / 1000) + 7 * 86400,
    status: 0,
    outcome: false,
    yesPool: 6_100_000_000_000_000_000n,
    noPool: 1_900_000_000_000_000_000n,
    live: false,
  },
  {
    id: 3,
    title: "OKB sets a new all-time high in 2026",
    category: "CRYPTO",
    endTime: Math.floor(Date.now() / 1000) + 60 * 86400,
    status: 0,
    outcome: false,
    yesPool: 2_400_000_000_000_000_000n,
    noPool: 2_600_000_000_000_000_000n,
    live: false,
  },
  // PULSE: short-dated markets on X Layer's own metrics — the chain
  // speculating on itself, resolved daily from public onchain data.
  {
    id: 4,
    title: "X Layer daily active wallets close above 50K today",
    category: "PULSE",
    endTime: Math.floor(Date.now() / 1000) + 86400,
    status: 0,
    outcome: false,
    yesPool: 3_300_000_000_000_000_000n,
    noPool: 1_700_000_000_000_000_000n,
    live: false,
  },
  {
    id: 5,
    title: "OKB 24h DEX volume finishes above $45M today",
    category: "PULSE",
    endTime: Math.floor(Date.now() / 1000) + 86400,
    status: 0,
    outcome: false,
    yesPool: 2_100_000_000_000_000_000n,
    noPool: 2_900_000_000_000_000_000n,
    live: false,
  },
];
