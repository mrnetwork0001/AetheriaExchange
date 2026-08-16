"use client";

import { useEffect, useRef, useState } from "react";
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
  // Mobile: the network badge + wallet button collapse into a hamburger
  // dropdown; on desktop they render inline and the burger is hidden (CSS).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside tap - a dropdown that only closes via the burger reads
  // as broken on touch devices.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const chain = SUPPORTED_CHAINS.find((c) => c.id === venueChainId);

  const controls = (
    <>
      {mismatch && venueChainId ? (
        <button
          className="chain-badge wrong"
          onClick={() => {
            switchChain({ chainId: venueChainId });
            setMenuOpen(false);
          }}
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
          onClick={() => {
            disconnect();
            setMenuOpen(false);
          }}
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
            setMenuOpen(false);
          }}
        >
          CONNECT WALLET
        </button>
      )}
    </>
  );

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

      {/* Desktop: inline controls. */}
      <div className="header-right header-right-desktop">{controls}</div>

      {/* Mobile: hamburger + dropdown. */}
      <div className="header-menu" ref={menuRef}>
        <button
          className={`menu-btn ${menuOpen ? "open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
        {menuOpen && <div className="menu-dropdown">{controls}</div>}
      </div>
    </header>
  );
}
