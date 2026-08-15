"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { explorerTxUrl } from "@/lib/chains";
import { outcomeMarketAbi } from "@/lib/contract";
import { fmtOkb } from "@/lib/payout";
import type { Position } from "@/hooks/usePositions";
import { useVenueChain } from "@/hooks/useVenueChain";

const STATE_LABEL: Record<Position["state"], { text: string; cls: string }> = {
  OPEN: { text: "OPEN", cls: "open" },
  WON: { text: "WON - CLAIMABLE", cls: "won" },
  LOST: { text: "LOST", cls: "lost" },
  REFUND: { text: "REFUND - CLAIMABLE", cls: "won" },
  CLAIMED: { text: "CLAIMED", cls: "claimed" },
};

type ClaimState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "done"; hash: string }
  | { phase: "error"; reason: string };

export function PositionsPanel({
  positions,
  live,
  connected,
  onRefetch,
}: {
  positions: Position[];
  live: boolean;
  connected: boolean;
  onRefetch: () => void;
}) {
  const { address, chainId: walletChainId } = useAccount();
  // Positions are read from the venue chain, so claims must be written there
  // too - a wallet parked elsewhere gets a switch prompt, never a dead
  // button.
  const { chainId: venueChainId, address: venue, chainName } = useVenueChain();
  const chainId = venueChainId ?? undefined;
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const [claims, setClaims] = useState<Record<number, ClaimState>>({});

  // Claim statuses belong to the connected account - reset on switch so a
  // prior account's "CLAIMED" doesn't mask the new account's CLAIM button.
  useEffect(() => {
    setClaims({});
  }, [address]);

  async function claim(marketId: number) {
    if (!venue || chainId === undefined) return;
    setClaims((c) => ({ ...c, [marketId]: { phase: "pending" } }));
    if (walletChainId !== chainId) {
      try {
        await switchChainAsync({ chainId });
      } catch {
        setClaims((c) => ({
          ...c,
          [marketId]: {
            phase: "error",
            reason: `SWITCH TO ${(chainName ?? "THE VENUE CHAIN").toUpperCase()} TO CLAIM`,
          },
        }));
        return;
      }
    }
    try {
      const hash = await writeContractAsync({
        abi: outcomeMarketAbi as any,
        address: venue,
        functionName: "claimPayout",
        args: [BigInt(marketId)],
        chainId,
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      setClaims((c) => ({ ...c, [marketId]: { phase: "done", hash } }));
      onRefetch();
    } catch (err: any) {
      setClaims((c) => ({
        ...c,
        [marketId]: {
          phase: "error",
          reason: err?.shortMessage?.toUpperCase?.() ?? "CLAIM FAILED",
        },
      }));
    }
  }

  if (live && !connected) {
    return (
      <p className="empty-note">CONNECT A WALLET TO TRACK YOUR POSITIONS.</p>
    );
  }
  if (positions.length === 0) {
    return (
      <p className="empty-note">
        NO OPEN POSITIONS - TAKE A SIDE ON A MARKET OR ASK THE CO-PILOT.
      </p>
    );
  }

  return (
    <div className="positions">
      {positions.map((pos) => {
        const label = STATE_LABEL[pos.state];
        const claimState = claims[pos.market.id] ?? { phase: "idle" };
        const claimable =
          live && (pos.state === "WON" || pos.state === "REFUND");
        return (
          <div key={pos.market.id} className="position-row">
            <div className="pos-main">
              <div className="pos-title">{pos.market.title}</div>
              <div className="pos-stakes">
                {pos.yesStake > 0n && (
                  <span className="yes-pct">
                    ▲ {fmtOkb(pos.yesStake)} OKB YES
                  </span>
                )}
                {pos.noStake > 0n && (
                  <span className="no-pct">
                    ▼ {fmtOkb(pos.noStake)} OKB NO
                  </span>
                )}
                <span className={`pos-status ${label.cls}`}>{label.text}</span>
              </div>
            </div>

            <div className="pos-side">
              <div className="pos-value">
                <span className="k">
                  {pos.state === "OPEN" ? "EST. IF WIN" : "VALUE"}
                </span>
                <span className="v">{fmtOkb(pos.value)} OKB</span>
              </div>
              {claimable &&
                (claimState.phase === "done" ? (
                  <a
                    className="leg-status confirmed"
                    href={explorerTxUrl(chainId ?? 1952, claimState.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    CLAIMED ↗
                  </a>
                ) : (
                  <button
                    className="claim-btn"
                    disabled={claimState.phase === "pending"}
                    onClick={() => claim(pos.market.id)}
                  >
                    {claimState.phase === "pending" ? "CLAIMING…" : "CLAIM"}
                  </button>
                ))}
              {claimState.phase === "error" && (
                <span className="leg-status error">{claimState.reason}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
