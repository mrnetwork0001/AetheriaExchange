"use client";

import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { SUPPORTED_CHAINS, xLayerTestnet } from "@/lib/chains";

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Header() {
  // walletChainId is the wallet's actual chain; useChainId() only ever
  // returns configured chains, so it can't detect a wrong network.
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  const wrongNetwork =
    isConnected && !SUPPORTED_CHAINS.some((c) => c.id === walletChainId);

  return (
    <header className="header">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/aetheria-header.png"
          alt="Aetheria Exchange"
          className="brand-logo"
        />
      </div>

      <div className="header-right">
        {wrongNetwork ? (
          <button
            className="chain-badge wrong"
            onClick={() => switchChain({ chainId: xLayerTestnet.id })}
            title="Click to switch to X Layer"
          >
            WRONG NETWORK - SWITCH
          </button>
        ) : (
          <span className="chain-badge">
            <span className="chain-dot" />
            {chain ? chain.name.toUpperCase() : "NO NETWORK"}
          </span>
        )}

        {isConnected && address ? (
          <button
            className="connect-btn"
            onClick={() => disconnect()}
            title="Disconnect"
          >
            {truncate(address)}
          </button>
        ) : (
          <button
            className="connect-btn"
            onClick={() => {
              const connector = connectors[0];
              if (connector) connect({ connector });
            }}
          >
            CONNECT WALLET
          </button>
        )}
      </div>
    </header>
  );
}
