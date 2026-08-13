"use client";

import { useEffect, useRef, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import type { Market } from "@/lib/contract";
import type { AppIntent, MarketDraft } from "@/lib/intent";
import {
  getMemoryStore,
  memoryKey,
  type ChatMessage,
} from "@/lib/memoryStore";
import { estimateNewStakePayout, fmtOkb, multiplier } from "@/lib/payout";
import { displaySymbol } from "@/lib/tokens";

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

// Feather-style microphone glyph - inline so no asset request.
function MicIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

export function CopilotPanel({
  markets,
  onExecute,
  onDraft,
  onClose,
}: {
  markets: Market[];
  onExecute: (intent: AppIntent) => void;
  onDraft: (draft: MarketDraft) => void;
  onClose?: () => void;
}) {
  const { address } = useAccount();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Voice input via the browser's Web Speech API (feature-detected after
  // mount so SSR and hydration render the same markup).
  const [speechOk, setSpeechOk] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  // Input text as it was when the mic started - recognition events carry the
  // WHOLE transcript-so-far each time, so the handler must always rebuild
  // base + transcript, never append.
  const micBaseRef = useRef("");
  // Messages restored from memory render instantly; only messages appended
  // this session animate.
  const [animateFrom, setAnimateFrom] = useState(1);
  const feedRef = useRef<HTMLDivElement>(null);
  const chatKey = memoryKey(address);
  // Which key the current `messages` state actually belongs to. On a wallet
  // switch, chatKey changes before the async load replaces messages - the
  // persist effect must not write the old wallet's chat under the new key.
  const loadedKeyRef = useRef<string | null>(null);

  // Load the wallet's persistent chat memory; re-runs on account switch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = getMemoryStore();
      const stored = store ? await store.load(chatKey) : null;
      if (cancelled) return;
      const restored =
        stored && stored.messages.length > 0 ? stored.messages : [WELCOME];
      setMessages(restored);
      setAnimateFrom(restored.length);
      loadedKeyRef.current = chatKey;
    })();
    return () => {
      cancelled = true;
    };
  }, [chatKey]);

  // Persist on every change (skip the pristine welcome-only state, and never
  // persist messages that belong to a different key than they were loaded for).
  useEffect(() => {
    if (messages.length <= 1) return;
    if (loadedKeyRef.current !== chatKey) return;
    getMemoryStore()?.save(chatKey, { messages, updatedAt: Date.now() });
  }, [messages, chatKey]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    const w = window as any;
    setSpeechOk(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* recognition already gone */
      }
    };
  }, []);

  function toggleMic() {
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        setListening(false);
      }
      return;
    }
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    micBaseRef.current = input.trim();
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      // Rebuild the full transcript from every result (final + interim) -
      // events are cumulative snapshots, so replacing is correct and
      // appending would duplicate every prefix.
      let t = "";
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i]?.[0]?.transcript ?? "";
      }
      t = t.trim();
      setInput(micBaseRef.current ? `${micBaseRef.current} ${t}` : t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  function reset() {
    getMemoryStore()?.clear(chatKey);
    setMessages([WELCOME]);
    setAnimateFrom(1);
  }

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
          // Recent history gives the AI cross-session context
          // ("hedge that position", "same again but NO").
          history: messages
            .slice(-8)
            .map((m) => ({ role: m.role, text: m.text })),
          // Only tradable markets: a resolved or cancelled market can't take
          // a bet, and leaving them in makes the co-pilot hesitate between
          // same-titled live and dead entries.
          currentMarketContext: markets
            .filter(
              (m) => m.status === 0 && m.endTime > Math.floor(Date.now() / 1000)
            )
            .map((m) => ({
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {messages.length > 1 && (
            <button
              className="chip"
              style={{ padding: "4px 8px", fontSize: 9 }}
              onClick={reset}
              title="Clear this wallet's chat memory"
            >
              RESET
            </button>
          )}
          <span className="copilot-dot" />
          {onClose && (
            <button
              className="copilot-close"
              onClick={onClose}
              title="Hide the co-pilot (reopen with ASK AI)"
            >
              ✕
            </button>
          )}
        </div>
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
              {msg.role === "copilot" && i >= animateFrom ? (
                <Typewriter text={msg.text} />
              ) : (
                msg.text
              )}

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
                        {msg.intent.dexTrade.amount}{" "}
                        {displaySymbol(msg.intent.dexTrade.tokenIn)} →{" "}
                        {displaySymbol(msg.intent.dexTrade.tokenOut)}
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
          placeholder={listening ? "LISTENING…" : "ASK THE CO-PILOT_"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
        />
        {speechOk && (
          <button
            className={`mic-btn ${listening ? "listening" : ""}`}
            onClick={toggleMic}
            disabled={busy}
            title={listening ? "Stop listening" : "Speak your trade"}
            aria-label={listening ? "Stop listening" : "Speak your trade"}
          >
            {listening ? (
              <span className="mic-eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <MicIcon />
            )}
          </button>
        )}
        <button onClick={() => send()} disabled={busy || !input.trim()}>
          SEND
        </button>
      </div>
    </aside>
  );
}
