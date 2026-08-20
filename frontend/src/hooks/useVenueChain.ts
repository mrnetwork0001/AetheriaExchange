"use client";

import { useAccount } from "wagmi";
import { contractAddress } from "@/lib/contract";
import { SUPPORTED_CHAINS } from "@/lib/chains";

// Which chain the app should READ the venue from.
//
// The wallet's chain wins when a venue is deployed there. When it is not
// (wallet on mainnet before the mainnet launch, or on an unrelated chain),
// fall back to the first supported chain that HAS a venue - showing the real
// venue read-only beats showing fabricated demo data, which is what the old
// useChainId()-everywhere approach did: a wallet on chain 196 was served
// invented markets, invented positions and a fake settlement in the ticker.
//
// Demo data now survives only when no venue exists on ANY chain (a fresh
// clone before any deploy), which is the one situation it was built for.
export interface VenueChain {
  // Chain to read from; null = no venue anywhere → offline preview.
  chainId: number | null;
  address: `0x${string}` | null;
  chainName: string | null;
  // Wallet is connected somewhere other than the venue chain - reads still
  // work, but writes will prompt a switch. Surface this loudly.
  mismatch: boolean;
  walletChainId: number | undefined;
}

export function useVenueChain(): VenueChain {
  const { chainId: walletChainId, isConnected } = useAccount();

  const walletVenue = contractAddress(walletChainId);
  // Prefer a mainnet venue whenever one exists - matching the precedence the
  // API routes already apply. Array order must NOT decide this: the moment
  // mainnet deploys, both chains have an address, and a bare `find` over
  // SUPPORTED_CHAINS would pin every disconnected visitor (i.e. anyone
  // opening the site cold) to the testnet venue while the APIs served
  // mainnet.
  const venues = SUPPORTED_CHAINS.filter((c) => contractAddress(c.id) !== null);
  const fallback = venues.find((c) => !c.testnet) ?? venues[0] ?? null;

  const chainId = walletVenue
    ? (walletChainId as number)
    : (fallback?.id ?? null);
  const address = walletVenue ?? (fallback ? contractAddress(fallback.id) : null);

  return {
    chainId,
    address,
    chainName:
      SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ?? null,
    mismatch:
      isConnected && chainId !== null && walletChainId !== chainId,
    walletChainId,
  };
}
