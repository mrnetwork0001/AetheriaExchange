"use client";

import { useEffect, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { explorerTxUrl, SUPPORTED_CHAINS } from "@/lib/chains";
import { contractAddress, outcomeMarketAbi, type Market } from "@/lib/contract";
import type { AppIntent } from "@/lib/intent";
import { estimateNewStakePayout, fmtOkb, multiplier } from "@/lib/payout";
import { displaySymbol } from "@/lib/tokens";
import { okxInterfaceUrl, prepareSwap } from "@/services/dexRouter";

function payoutPreview(
  amount: string,
  isYes: boolean,
  market: Market | null
): { payout: string; mult: string } | null {
  if (!market) return null;
  try {
    const stake = parseEther(amount);
    if (stake === 0n) return null;
    const payout = estimateNewStakePayout(
      stake,
      isYes,
      market.yesPool,
      market.noPool
    );
    return { payout: fmtOkb(payout), mult: multiplier(stake, payout) };
  } catch {
    return null;
  }
}

type LegState =
  | { phase: "idle" }
  | { phase: "pending"; note?: string }
  | { phase: "confirmed"; hash: string }
  | { phase: "error"; reason: string }
  | { phase: "skipped"; reason: string }
  // Hedge routed to the OKX DEX interface (the Launch-Grant-eligible path);
  // execution completes there, outside this modal.
  | { phase: "external"; url: string };

function LegStatus({ state, chainId }: { state: LegState; chainId: number }) {
  switch (state.phase) {
    case "idle":
      return <span className="leg-status skipped">READY</span>;
    case "pending":
      return (
        <span className="leg-status pending">
          {state.note ?? "AWAITING SIGNATURE…"}
        </span>
      );
    case "confirmed":
      return (
        <a
          className="leg-status confirmed"
          href={explorerTxUrl(chainId, state.hash)}
          target="_blank"
          rel="noreferrer"
        >
          CONFIRMED ↗
        </a>
      );
    case "error":
      return <span className="leg-status error">{state.reason}</span>;
    case "skipped":
      return <span className="leg-status skipped">{state.reason}</span>;
    case "external":
      // Opening the interface is not the same as executing there - the user
      // still picks the amount and signs on OKX, so never imply it is done.
      return (
        <a
          className="leg-status skipped"
          href={state.url}
          target="_blank"
          rel="noreferrer"
          title="Set the amount and confirm the swap on OKX DEX"
        >
          OPENED ON OKX - CONFIRM THERE ↗
        </a>
      );
  }
}

export function ExecutionModal({
  intent,
  markets,
  onClose,
}: {
  intent: AppIntent;
  markets: Market[];
  onClose: () => void;
}) {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const chainId = useChainId(); // config-tracked target chain (195/196)
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const venueAddress = contractAddress(chainId);
  const outcomeTrade = intent.outcomeTrade;
  const dexTrade = intent.dexTrade;
  const market = outcomeTrade
    ? markets.find((m) => m.id === outcomeTrade.marketId) ?? null
    : null;

  const [amount, setAmount] = useState(outcomeTrade?.amount ?? "1");
  const [outcomeState, setOutcomeState] = useState<LegState>({ phase: "idle" });
  const [dexState, setDexState] = useState<LegState>({ phase: "idle" });
  const [running, setRunning] = useState(false);
  // Synchronous re-entry guard: React state alone can lag a rapid second call.
  const runningRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done =
    (outcomeState.phase === "confirmed" ||
      outcomeState.phase === "skipped" ||
      !outcomeTrade) &&
    (dexState.phase === "confirmed" ||
      dexState.phase === "skipped" ||
      dexState.phase === "external" ||
      !dexTrade);

  // Grant-eligible path: open the OKX DEX interface with the hedge prefilled
  // and mark the leg as externally routed so in-app execution won't double it.
  function routeViaInterface() {
    if (!dexTrade || running) return;
    const url = okxInterfaceUrl(dexTrade, chainId);
    window.open(url, "_blank", "noopener,noreferrer");
    setDexState({ phase: "external", url });
  }

  async function execute() {
    if (!isConnected || !address) {
      const connector = connectors[0];
      if (connector) connect({ connector });
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);

    try {
      // The wallet must actually be on the target X Layer chain before any
      // value-bearing transaction leaves it - useChainId() only tracks
      // configured chains, so check the wallet's own chainId here.
      if (walletChainId !== chainId) {
        try {
          await switchChainAsync({ chainId });
        } catch {
          const supported = SUPPORTED_CHAINS.map((c) => c.id).join("/");
          setOutcomeState({ phase: "error", reason: `SWITCH WALLET TO CHAIN ${supported}` });
          return;
        }
      }

      // Tracks whether the primary position actually exists (placed now, or
      // confirmed on a previous attempt). The hedge must never run without it.
      let outcomePlaced = !outcomeTrade || outcomeState.phase === "confirmed";

      // Leg 1 - outcome bet on the OutcomeMarket venue (native OKB).
      // Skipped when already confirmed so a retry never double-spends the stake.
      if (outcomeTrade && outcomeState.phase !== "confirmed") {
        if (!venueAddress) {
          setOutcomeState({
            phase: "skipped",
            reason: "VENUE NOT DEPLOYED ON THIS CHAIN",
          });
        } else if (!market || market.status !== 0) {
          setOutcomeState({ phase: "skipped", reason: "MARKET NOT OPEN" });
        } else if (market.endTime <= Math.floor(Date.now() / 1000)) {
          // buyShares reverts after endTime; a ticket restored from chat
          // memory can easily outlive the market it was built for.
          setOutcomeState({ phase: "skipped", reason: "TRADING HAS CLOSED" });
        } else {
          try {
            setOutcomeState({ phase: "pending" });
            const hash = await writeContractAsync({
              abi: outcomeMarketAbi as any,
              address: venueAddress,
              functionName: "buyShares",
              args: [BigInt(outcomeTrade.marketId), outcomeTrade.isYes],
              value: parseEther(amount),
              chainId,
            });
            setOutcomeState({ phase: "pending", note: "CONFIRMING ON X LAYER…" });
            await publicClient?.waitForTransactionReceipt({ hash });
            setOutcomeState({ phase: "confirmed", hash });
            outcomePlaced = true;
          } catch (err: any) {
            setOutcomeState({
              phase: "error",
              reason: err?.shortMessage?.toUpperCase?.() ?? "TX FAILED",
            });
            return; // don't fire the hedge if the primary leg failed
          }
        }
      }

      // Leg 2 - correlated swap routed through the OKX DEX aggregator.
      // Only runs when the position it hedges actually exists, and never
      // when the hedge was already routed to the OKX interface.
      if (
        dexTrade &&
        dexState.phase !== "confirmed" &&
        dexState.phase !== "external"
      ) {
        if (outcomeTrade && !outcomePlaced) {
          setDexState({ phase: "skipped", reason: "PRIMARY LEG SKIPPED" });
          return;
        }
        try {
          setDexState({ phase: "pending", note: "ROUTING VIA OKX DEX…" });
          const prep = await prepareSwap(dexTrade, chainId, address);
          if (prep.status === "unavailable") {
            setDexState({ phase: "skipped", reason: "DEX ROUTING OFFLINE" });
            return;
          }
          if (prep.status === "error") {
            setDexState({ phase: "error", reason: prep.reason.toUpperCase() });
            return;
          }

          // ERC-20 inputs need an allowance for the OKX router before the
          // swap's transferFrom can succeed.
          const { approval, amountBaseUnits } = prep.swap;
          if (approval && publicClient) {
            const allowance = await publicClient.readContract({
              address: approval.tokenAddress,
              abi: erc20Abi,
              functionName: "allowance",
              args: [address, approval.spender],
            });
            if (allowance < BigInt(amountBaseUnits)) {
              setDexState({ phase: "pending", note: "APPROVING TOKEN…" });
              const approveHash = await sendTransactionAsync({
                to: approval.tokenAddress,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [approval.spender, BigInt(amountBaseUnits)],
                }),
                chainId,
              });
              setDexState({ phase: "pending", note: "CONFIRMING APPROVAL…" });
              await publicClient.waitForTransactionReceipt({ hash: approveHash });
            }
          }

          setDexState({ phase: "pending" });
          const hash = await sendTransactionAsync({
            to: prep.swap.tx.to,
            data: prep.swap.tx.data,
            value: prep.swap.tx.value,
            chainId,
          });
          setDexState({ phase: "pending", note: "CONFIRMING ON X LAYER…" });
          await publicClient?.waitForTransactionReceipt({ hash });
          setDexState({ phase: "confirmed", hash });
        } catch (err: any) {
          setDexState({
            phase: "error",
            reason: err?.shortMessage?.toUpperCase?.() ?? "SWAP FAILED",
          });
        }
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="label">EXECUTION TICKET</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {outcomeTrade && (
            <div className="ticket-leg">
              <div className="ticket-row">
                <span className="k">Leg 1 · Outcome venue</span>
                <LegStatus state={outcomeState} chainId={chainId} />
              </div>
              <div className="ticket-row">
                <span className="k">Market</span>
                <span className="v" style={{ maxWidth: 300, textAlign: "right" }}>
                  {market?.title ?? `#${outcomeTrade.marketId}`}
                </span>
              </div>
              <div className="ticket-row">
                <span className="k">Position</span>
                <span className={`v ${outcomeTrade.isYes ? "yes" : "no"}`}>
                  {outcomeTrade.isYes ? "YES" : "NO"}
                </span>
              </div>
              <div className="ticket-row">
                <span className="k">Stake (OKB)</span>
                <input
                  className="amount-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={running || outcomeState.phase === "confirmed"}
                  inputMode="decimal"
                />
              </div>
              {(() => {
                const est = payoutPreview(amount, outcomeTrade.isYes, market);
                return (
                  <div className="ticket-row">
                    <span
                      className="k"
                      title="Parimutuel estimate at current pool sizes - the final payout depends on the pools when the market closes"
                    >
                      Est. payout if {outcomeTrade.isYes ? "YES" : "NO"}
                      <span style={{ color: "var(--faint)" }}>
                        {" "}
                        (at current pools)
                      </span>
                    </span>
                    <span
                      className={`v ${outcomeTrade.isYes ? "yes" : "no"}`}
                    >
                      {est ? `${est.payout} OKB · ${est.mult}` : "-"}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}

          {dexTrade && (
            <div className="ticket-leg">
              <div className="ticket-row">
                <span className="k">
                  Leg {outcomeTrade ? 2 : 1} · OKX DEX
                </span>
                <LegStatus state={dexState} chainId={chainId} />
              </div>
              <div className="ticket-row">
                <span className="k">Swap</span>
                <span className="v">
                  {dexTrade.amount} {displaySymbol(dexTrade.tokenIn)} →{" "}
                  {displaySymbol(dexTrade.tokenOut)}
                </span>
              </div>
              <div className="ticket-row">
                <span className="k">Rationale</span>
                <span
                  className="v"
                  style={{ maxWidth: 300, textAlign: "right", color: "var(--dim)" }}
                >
                  {dexTrade.reasoning}
                </span>
              </div>
              {dexState.phase !== "confirmed" &&
                dexState.phase !== "external" && (
                  <button
                    className="okx-route-btn"
                    disabled={running}
                    onClick={routeViaInterface}
                  >
                    HEDGE ON OKX DEX ↗ · GRANT-ELIGIBLE VOLUME
                  </button>
                )}
            </div>
          )}

          <p className="modal-note">
            NON-CUSTODIAL EXECUTION - EACH LEG IS A SEPARATE TRANSACTION SIGNED
            IN YOUR WALLET. PREDICTION MARKETS AND SPOT TRADES CARRY RISK OF
            TOTAL LOSS. THIS IS NOT FINANCIAL ADVICE.
            {outcomeTrade &&
              " PAYOUTS ARE PARIMUTUEL: THE ESTIMATE USES POOL SIZES RIGHT NOW, AND YOUR ACTUAL PAYOUT IS SET BY THE POOLS AT CLOSE - IT FALLS AS MORE STAKE JOINS YOUR SIDE. POSITIONS CANNOT BE SOLD BEFORE RESOLUTION."}
            {dexTrade &&
              " HEDGES EXECUTED ON THE OKX DEX INTERFACE COUNT TOWARD LAUNCH-GRANT VOLUME; IN-APP API ROUTING DOES NOT."}
          </p>

          {done ? (
            <button className="approve-btn" onClick={onClose}>
              {dexState.phase === "external" ? "CLOSE" : "DONE"}
            </button>
          ) : (
            <button className="approve-btn" onClick={execute} disabled={running}>
              {!isConnected
                ? "CONNECT WALLET"
                : running
                  ? "EXECUTING…"
                  : outcomeState.phase === "error" || dexState.phase === "error"
                    ? "RETRY FAILED LEG"
                    : "APPROVE & TRADE"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
