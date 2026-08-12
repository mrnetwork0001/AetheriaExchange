import { http, createConfig } from "wagmi";
import { xLayer, xLayerTestnet } from "./chains";

// No explicit connectors: wagmi's EIP-6963 multi-injected-provider discovery
// (on by default) picks up OKX Web3 Wallet, MetaMask, and other browser
// wallets automatically. This also avoids bundling the full
// wagmi/connectors barrel, which drags in unused Coinbase dependencies.
export const wagmiConfig = createConfig({
  chains: [xLayerTestnet, xLayer],
  transports: {
    [xLayerTestnet.id]: http(),
    [xLayer.id]: http(),
  },
  ssr: true,
});
