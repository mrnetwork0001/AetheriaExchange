import { defineChain } from "viem";

// Canonical Multicall3, verified deployed on both X Layer chains. Declaring
// it lets viem fold the per-market getMarket reads into ONE rpc call - the
// market grid otherwise issues one request per market every refetch, which
// public RPCs rate-limit well before the venue gets large.
const MULTICALL3 = {
  multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
} as const;

export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testrpc.xlayer.tech"] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer-test" },
  },
  contracts: MULTICALL3,
  testnet: true,
});

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech"] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer" },
  },
  contracts: MULTICALL3,
});

export const SUPPORTED_CHAINS = [xLayerTestnet, xLayer] as const;

export function explorerTxUrl(chainId: number, hash: string): string {
  const base =
    chainId === 196
      ? "https://www.oklink.com/xlayer"
      : "https://www.oklink.com/xlayer-test";
  return `${base}/tx/${hash}`;
}
