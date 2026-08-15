"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { outcomeMarketAbi } from "@/lib/contract";
import { useVenueChain } from "@/hooks/useVenueChain";

const CATEGORIES = ["CRYPTO", "MACRO", "SPORTS", "WEB3", "PULSE", "RWA", "EQUITY", "OTHER"];

type SubmitState =
  | { phase: "idle" }
  | { phase: "pending"; note: string }
  | { phase: "error"; reason: string };

export interface CreateMarketInitial {
  title?: string;
  category?: string;
  endLocal?: string;
}

export function CreateMarketModal({
  live,
  initial,
  onClose,
  onCreated,
}: {
  live: boolean;
  initial?: CreateMarketInitial;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  // Deploy onto the chain that has the venue, wherever the wallet is parked.
  const { chainId: venueChainId, address: venue, chainName } = useVenueChain();
  const chainId = venueChainId ?? undefined;
  const { connect, connectors } = useConnect();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(
    initial?.category && CATEGORIES.includes(initial.category)
      ? initial.category
      : "CRYPTO"
  );
  const [endLocal, setEndLocal] = useState(initial?.endLocal ?? "");
  const [state, setState] = useState<SubmitState>({ phase: "idle" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const endEpoch = endLocal ? Math.floor(new Date(endLocal).getTime() / 1000) : 0;
  const valid =
    title.trim().length > 0 && endEpoch > Math.floor(Date.now() / 1000);

  async function submit() {
    if (!live || !venue || chainId === undefined) return;
    if (!isConnected || !address) {
      const connector = connectors[0];
      if (connector) connect({ connector });
      return;
    }
    if (!valid || state.phase === "pending") return;
    if (walletChainId !== chainId) {
      setState({ phase: "pending", note: "SWITCHING NETWORK…" });
      try {
        await switchChainAsync({ chainId });
      } catch {
        setState({
          phase: "error",
          reason: `SWITCH YOUR WALLET TO ${(chainName ?? "THE VENUE CHAIN").toUpperCase()} FIRST`,
        });
        return;
      }
    }
    try {
      setState({ phase: "pending", note: "AWAITING SIGNATURE…" });
      const hash = await writeContractAsync({
        abi: outcomeMarketAbi as any,
        address: venue,
        functionName: "createMarket",
        args: [title.trim(), BigInt(endEpoch), category],
        chainId,
      });
      setState({ phase: "pending", note: "CONFIRMING ON X LAYER…" });
      await publicClient?.waitForTransactionReceipt({ hash });
      onCreated();
      onClose();
    } catch (err: any) {
      setState({
        phase: "error",
        reason: err?.shortMessage?.toUpperCase?.() ?? "TX FAILED",
      });
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="label">DEPLOY MARKET</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <span className="k label" style={{ fontSize: 9 }}>
              QUESTION (RESOLVES YES / NO)
            </span>
            <input
              className="text-input"
              placeholder="e.g. BTC trades above $150K before Dec 31, 2026"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <span className="k label" style={{ fontSize: 9 }}>
              CATEGORY
            </span>
            <div className="chip-row">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={`chip ${category === c ? "active" : ""}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="k label" style={{ fontSize: 9 }}>
              TRADING CLOSES
            </span>
            <input
              className="text-input"
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
          </div>

          <p className="modal-note">
            MARKET CREATION IS PERMISSIONLESS. RESOLUTION IS PERFORMED BY THE
            VENUE RESOLVER AFTER CLOSE - 2% OF THE LOSING POOL FUNDS THE
            PROTOCOL.
          </p>

          {state.phase === "error" && (
            <span className="leg-status error">{state.reason}</span>
          )}

          {!live ? (
            <button className="approve-btn" disabled>
              VENUE NOT DEPLOYED - TESTNET SOON
            </button>
          ) : (
            <button
              className="approve-btn"
              disabled={(!valid && isConnected) || state.phase === "pending"}
              onClick={submit}
            >
              {!isConnected
                ? "CONNECT WALLET"
                : state.phase === "pending"
                  ? state.note
                  : "DEPLOY MARKET"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
