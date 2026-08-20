import { defineChain } from "viem";

// Canonical Multicall3, verified deployed on both X Layer chains. Declaring
// it lets viem fold the per-market getMarket reads into ONE rpc call - the
// market grid otherwise issues one request per market every refetch, which
// public RPCs rate-limit well before the venue gets large.
const MULTICALL3 = {
  multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
} as const;

// X Layer's official explorer, at web3.okx.com. The two networks have
// asymmetric paths, verified against live redirects: mainnet is canonically
// /explorer/x-layer/evm (the bare /explorer/x-layer/tx/... 301s to it) while
// testnet is /explorer/x-layer-testnet with NO /evm segment (adding one is a
// hard 404). Both then take /tx/<hash> and /address/<addr>, so the standard
// `${base}/tx/${hash}` shape below is correct for each.
export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testrpc.xlayer.tech"] },
  },
  blockExplorers: {
    default: {
      name: "X Layer Explorer",
      url: "https://web3.okx.com/explorer/x-layer-testnet",
    },
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
    default: {
      name: "X Layer Explorer",
      url: "https://web3.okx.com/explorer/x-layer/evm",
    },
  },
  contracts: MULTICALL3,
});

export const SUPPORTED_CHAINS = [xLayerTestnet, xLayer] as const;

// Anything that is not mainnet resolves to the testnet explorer, so a link
// never silently points at the wrong network's copy of an address.
export function explorerBaseUrl(chainId: number): string {
  return chainId === xLayer.id
    ? xLayer.blockExplorers.default.url
    : xLayerTestnet.blockExplorers.default.url;
}

export function explorerTxUrl(chainId: number, hash: string): string {
  return `${explorerBaseUrl(chainId)}/tx/${hash}`;
}

export function explorerAddressUrl(chainId: number, address: string): string {
  return `${explorerBaseUrl(chainId)}/address/${address}`;
}
