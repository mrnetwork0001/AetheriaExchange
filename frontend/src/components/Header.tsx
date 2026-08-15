"use client";

import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { SUPPORTED_CHAINS } from "@/lib/chains";
import { useVenueChain } from "@/hooks/useVenueChain";

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Header() {
  const { address, isConnected } = useAccount();
  // "Wrong network" means the wallet's chain has no venue - not merely an
  // unlisted chain. The switch target is wherever the venue actually is, so
  // this stays correct the day mainnet deploys.
  const { chainId: venueChainId, chainName, mismatch } = useVenueChain();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const chain = SUPPORTED_CHAINS.find((c) => c.id === venueChainId);

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
        {mismatch && venueChainId ? (
          <button
            className="chain-badge wrong"
            onClick={() => switchChain({ chainId: venueChainId })}
            title={`Click to switch to ${chainName ?? "the venue chain"}`}
          >
            SWITCH TO {(chainName ?? "VENUE CHAIN").toUpperCase()}
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
