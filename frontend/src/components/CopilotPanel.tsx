"use client";

import { useEffect, useRef, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import type { Market } from "@/lib/contract";
import type { AppIntent, MarketDraft } from "@/lib/intent";
import { estimateNewStakePayout, fmtOkb, multiplier } from "@/lib/payout";

interface ChatMessage {
  role: "user" | "copilot";
  text: string;
  intent?: AppIntent;
}

const WELCOME: ChatMessage = {
  role: "copilot",
  text: "Co-pilot online. Ask about a market, or tell me a position - I turn intent into a 1-click trade ticket with a correlated OKX DEX hedge.",
};

const SUGGESTED_PROMPTS = [
  "Bet 2 OKB YES on market 0 and hedge it",
  "Which market has the best risk/reward?",
  "Create today's X Layer pulse market on active wallets",
  "How would I hedge BTC exposure with USDT?",
];

// Progressive text reveal - runs once per mounted message.
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!text) return;
    const step = Math.max(2, Math.round(text.length / 45));
    const timer = setInterval(() => {
      setN((prev) => {
        const next = prev + step;
        if (next >= text.length) clearInterval(timer);
        return Math.min(next, text.length);
      });
    }, 18);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{text.slice(0, n)}</>;
}

function outcomeQuote(intent: AppIntent, markets: Market[]): string | null {
  const trade = intent.outcomeTrade;
  if (!trade) return null;
  const market = markets.find((m) => m.id === trade.marketId);
  if (!market) return null;
  try {
    const stake = parseEther(trade.amount);
    if (stake === 0n) return null;
    const payout = estimateNewStakePayout(
      stake,
      trade.isYes,
      market.yesPool,
      market.noPool
    );
    const total = market.yesPool + market.noPool;
    const pct =
      total === 0n
        ? 50
        : Number(((trade.isYes ? market.yesPool : market.noPool) * 100n) / total);
    return `${pct}% IMPLIED · RETURNS ~${fmtOkb(payout)} OKB (${multiplier(stake, payout)}) IF ${trade.isYes ? "YES" : "NO"}`;
  } catch {
    return null;
  }
}

export function CopilotPanel({
  markets,
  onExecute,
  onDraft,
}: {
  markets: Market[];
  onExecute: (intent: AppIntent) => void;
  onDraft: (draft: MarketDraft) => void;
}) {
  const { address } = useAccount();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setBusy(true);

    try {
      const res = await fetch("/api/ai/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          userWallet: address ?? null,
          currentMarketContext: markets.map((m) => ({
            id: m.id,
            title: m.title,
            category: m.category,
            yesPoolOkb: formatEther(m.yesPool),
            noPoolOkb: formatEther(m.noPool),
            endTime: m.endTime,
          })),
        }),
      });
      const intent: AppIntent = await res.json();
      setMessages((m) => [
        ...m,
        { role: "copilot", text: intent.explanation, intent },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "copilot", text: "Intent engine unreachable. Try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="copilot" id="copilot">
      <div className="copilot-head">
        <span className="label">AI CO-PILOT</span>
        <span className="copilot-dot" />
      </div>

      <div className="copilot-feed" ref={feedRef}>
        {messages.map((msg, i) => {
          const quote = msg.intent ? outcomeQuote(msg.intent, markets) : null;
          return (
            <div
              key={i}
              className={`msg ${msg.role === "user" ? "msg-user" : "msg-copilot"}`}
            >
              {msg.role === "copilot" && (
                <span className="label who" style={{ fontSize: 9 }}>
                  CO-PILOT
                  {msg.intent?.engine === "offline-fallback" ? " · OFFLINE" : ""}
                </span>
              )}
              {msg.role === "copilot" ? <Typewriter text={msg.text} /> : msg.text}

              {msg.intent &&
                (msg.intent.outcomeTrade || msg.intent.dexTrade) && (
                  <div className="intent-card">
                    <div className="label" style={{ fontSize: 9 }}>
                      {msg.intent.intentType.replace("_", " ")}
                    </div>
                    <div className="summary">{msg.intent.summary}</div>
                    {msg.intent.outcomeTrade && (
                      <div className="intent-leg">
                        LEG 1 · OUTCOME - {msg.intent.outcomeTrade.amount} OKB{" "}
                        {msg.intent.outcomeTrade.isYes ? "YES" : "NO"} on market
                        #{msg.intent.outcomeTrade.marketId}
                        {quote && <div className="intent-quote">{quote}</div>}
                      </div>
                    )}
                    {msg.intent.dexTrade && (
                      <div className="intent-leg">
                        LEG {msg.intent.outcomeTrade ? 2 : 1} · OKX DEX -{" "}
                        {msg.intent.dexTrade.amount} {msg.intent.dexTrade.tokenIn}{" "}
                        → {msg.intent.dexTrade.tokenOut}
                      </div>
                    )}
                    <button
                      className="intent-execute"
                      onClick={() => onExecute(msg.intent!)}
                    >
                      PREPARE EXECUTION
                    </button>
                  </div>
                )}

              {msg.intent?.marketDraft && (
                <div className="intent-card">
                  <div className="label" style={{ fontSize: 9 }}>
                    MARKET DRAFT
                  </div>
                  <div className="summary">{msg.intent.marketDraft.title}</div>
                  <div className="intent-leg">
                    {msg.intent.marketDraft.category} · CLOSES{" "}
                    {new Date(
                      msg.intent.marketDraft.endTimeIso
                    ).toLocaleString()}
                  </div>
                  <button
                    className="intent-execute"
                    onClick={() => onDraft(msg.intent!.marketDraft!)}
                  >
                    OPEN DEPLOY TICKET
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {busy && <div className="thinking">ANALYZING MARKET INTENT…</div>}

        {!busy && messages.length <= 2 && (
          <div className="chip-row prompt-chips">
            {SUGGESTED_PROMPTS.map((p) => (
              <button key={p} className="chip" onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="copilot-input">
        <input
          value={input}
          placeholder="ASK THE CO-PILOT_"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()}>
          SEND
        </button>
      </div>
    </aside>
  );
}
