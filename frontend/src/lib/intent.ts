// Shared shape of the AI Co-Pilot's structured trade intent.
export type IntentType =
  | "OUTCOME_BET"
  | "DEX_HEDGE"
  | "DUAL_STRATEGY"
  | "MARKET_ANALYSIS"
  | "MARKET_DRAFT";

// AI-drafted market proposal (from a headline or topic the user gives).
export interface MarketDraft {
  title: string; // precise, objectively resolvable YES/NO question
  category: string;
  endTimeIso: string; // ISO 8601 — when trading should close
  rationale: string;
}

export interface OutcomeTrade {
  marketId: number;
  isYes: boolean;
  amount: string; // native OKB, human units
}

export interface DexTrade {
  tokenIn: string; // symbol, e.g. "USDT"
  tokenOut: string; // symbol, e.g. "OKB"
  amount: string; // human units of tokenIn
  reasoning: string;
}

export interface AppIntent {
  intentType: IntentType;
  summary: string;
  outcomeTrade: OutcomeTrade | null;
  dexTrade: DexTrade | null;
  marketDraft?: MarketDraft | null;
  explanation: string;
  engine?: string; // "claude-opus-5" | "offline-fallback"
}
