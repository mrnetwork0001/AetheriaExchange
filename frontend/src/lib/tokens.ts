// Token registry for X Layer (chain 196). Native OKB uses the aggregator's
// canonical pseudo-address. Verify ERC-20 addresses against the OKX token
// list before mainnet launch.
export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

export const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const XLAYER_TOKENS: Record<string, TokenInfo> = {
  OKB: { symbol: "OKB", address: NATIVE_TOKEN, decimals: 18 },
  WOKB: {
    symbol: "WOKB",
    address: "0xe538905cf8410324e03A5A23C1c177a474D59b2b",
    decimals: 18,
  },
  USDT: {
    symbol: "USDT",
    address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
    decimals: 6,
  },
  USDC: {
    symbol: "USDC",
    address: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
    decimals: 6,
  },
};

export function resolveToken(symbol: string): TokenInfo | null {
  return XLAYER_TOKENS[symbol.toUpperCase()] ?? null;
}
