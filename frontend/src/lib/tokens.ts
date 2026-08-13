// Token registry for X Layer (chain 196). Native OKB uses the aggregator's
// canonical pseudo-address. Every ERC-20 address below was verified by
// reading symbol()/name()/decimals() from https://rpc.xlayer.tech.
export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  // Shown in the execution ticket so the user knows what they are getting.
  label?: string;
}

export const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const XLAYER_TOKENS: Record<string, TokenInfo> = {
  OKB: { symbol: "OKB", address: NATIVE_TOKEN, decimals: 18, label: "Native gas token" },
  WOKB: {
    symbol: "WOKB",
    address: "0xe538905cf8410324e03A5A23C1c177a474D59b2b",
    decimals: 18,
    label: "Wrapped OKB",
  },
  USDT: {
    symbol: "USDT",
    address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
    decimals: 6,
    label: "Tether USD (bridged)",
  },
  // Tether's omnichain USDT. On X Layer this is the deeper market by a wide
  // margin (~113M supply and ~8x the transfer activity of the bridged token),
  // and it is the supply DefiLlama reports as USDT on this chain.
  USDT0: {
    symbol: "USDT0",
    address: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
    decimals: 6,
    label: "USD₮0 (omnichain USDT)",
  },
  // Circle-issued native USDC (on-chain name "USDC"). X Layer replaced the
  // bridged token with this on 2026-08-07 - it is the default USD leg.
  USDC: {
    symbol: "USDC",
    address: "0xB6CEceAB302E2E4948951eE7843FC24E92933061",
    decimals: 6,
    label: "Native USDC (Circle)",
  },
  // The deprecated bridged token (on-chain name "USD Coin"). Kept so holders
  // can route the migration swap; never the default.
  "USDC.E": {
    symbol: "USDC.E",
    address: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
    decimals: 6,
    label: "Bridged USDC (deprecated)",
  },

  // xStocks - tokenized equities. X Layer carries the majority of xStocks
  // trading volume, which makes an equity outcome bet hedgeable with the
  // underlying tokenized share on the same chain. All 18 decimals.
  WTSLAX: {
    symbol: "wTSLAx",
    address: "0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171",
    decimals: 18,
    label: "Wrapped Tesla xStock",
  },
  WNVDAX: {
    symbol: "wNVDAx",
    address: "0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5",
    decimals: 18,
    label: "Wrapped NVIDIA xStock",
  },
  WSPCXX: {
    symbol: "wSPCXx",
    address: "0x8e2eeD8b8B5E13Ea7BF38e50d7821d2C57309072",
    decimals: 18,
    label: "Wrapped SpaceX xStock",
  },
};

// Tokenized-equity tokens keyed by the underlying ticker, so an equity
// outcome bet can be paired with the matching xStock leg.
export const EQUITY_HEDGE: Record<string, string> = {
  TSLA: "wTSLAx",
  NVDA: "wNVDAx",
};

// Every tokenized-equity symbol in the registry - including ones with no
// public ticker (SpaceX), which must still never be paired with an unrelated
// market. Derived from the registry so a new xStock cannot be added without
// the pairing guards seeing it.
export const XSTOCK_SYMBOLS: string[] = Object.values(XLAYER_TOKENS)
  .filter((t) => t.label?.includes("xStock"))
  .map((t) => t.symbol.toUpperCase());

export function resolveToken(symbol: string): TokenInfo | null {
  const key = symbol.toUpperCase();
  // The AI may emit either spelling for the bridged token.
  return XLAYER_TOKENS[key === "USDCE" ? "USDC.E" : key] ?? null;
}

// Canonical casing for display - the intent pipeline normalizes symbols to
// uppercase, but "wTSLAx" should never be shown to a user as "WTSLAX".
export function displaySymbol(symbol: string): string {
  return resolveToken(symbol)?.symbol ?? symbol;
}
