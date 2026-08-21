"use client";

const STEPS = [
  {
    n: "01",
    title: "ASK",
    body: "Tell the co-pilot your view in plain language. A schema-constrained AI parses it into a structured intent - market, side, size, and a correlated hedge.",
    detail: "NATURAL LANGUAGE → STRUCTURED INTENT",
  },
  {
    n: "02",
    title: "TICKET",
    body: "The intent becomes an execution ticket: an outcome bet on the parimutuel venue plus an optional OKX DEX hedge, with implied odds and payout quoted upfront.",
    detail: "OUTCOME LEG + DEX LEG · PAYOUT QUOTED",
  },
  {
    n: "03",
    title: "EXECUTE",
    body: "One click, two signatures, zero custody. Each leg is signed in your own wallet and confirmed on X Layer with a public onchain receipt.",
    detail: "NON-CUSTODIAL · 1-CLICK · ON-CHAIN",
  },
];

export function LandingSections() {
  return (
    <>
      {/* ── how it works ── */}
      <section className="land-section" id="how-it-works">
        <span className="label">HOW IT WORKS</span>
        <div className="steps-grid">
          {STEPS.map((s) => (
            <div key={s.n} className="step-card">
              <div className="step-head">
                <span className="step-num">{s.n}</span>
                <span className="step-title">{s.title}</span>
              </div>
              <p className="step-body">{s.body}</p>
              <span className="step-detail label">{s.detail}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── volume engine ── */}
      <section className="land-section" id="volume-engine">
        <span className="label">VOLUME ENGINE</span>
        <div className="volume-grid">
          <div className="volume-copy">
            <h2>
              Every outcome bet is a reason
              <br />
              <span className="dim">to trade on OKX DEX.</span>
            </h2>
            <p>
              Prediction markets create conviction; conviction wants a hedge.
              When a user takes a position, the co-pilot proposes a correlated
              spot trade routed through the OKX DEX aggregator on X Layer - so
              a small outcome stake converts into real, attributable DEX
              volume.
            </p>
            <p className="volume-stance">
              NO WASH LOOPS. NO SYNTHETIC FLOW. EVERY SWAP IS A USER-SIGNED,
              ECONOMICALLY MOTIVATED TRADE - THE ONLY KIND THAT COUNTS.
            </p>
          </div>
          <div className="volume-term">
            <div className="volume-term-head label">EXAMPLE FLOW</div>
            <div className="term-line">
              <span className="t-prompt">&gt;</span> BET{" "}
              <span className="yes-pct">5 OKB YES</span> · NIGERIA WINS
              QUALIFIER
            </div>
            <div className="term-line">
              <span className="t-prompt">&gt;</span> CO-PILOT PAIRS{" "}
              <span className="no-pct">10 USDT → OKB</span> MOMENTUM HEDGE
            </div>
            <div className="term-line">
              <span className="t-prompt">&gt;</span> ROUTED VIA OKX DEX
              AGGREGATOR · X LAYER
            </div>
            <div className="term-line term-result">
              = 2 SIGNED TXS · 100% ORGANIC DEX VOLUME
            </div>
          </div>
        </div>
      </section>

      {/* ── architecture ── */}
      <section className="land-section" id="architecture">
        <span className="label">ARCHITECTURE</span>
        <div className="arch-wrap">
          <svg
            className="arch-svg"
            viewBox="0 0 800 340"
            role="img"
            aria-label="User wallet feeds the AI intent engine, which routes to the outcome venue and OKX DEX, both settling on X Layer"
          >
            {/* wallet */}
            <rect x="325" y="8" width="150" height="40" className="arch-box" />
            <text x="400" y="32" className="arch-text">
              USER WALLET
            </text>

            {/* wallet → engine */}
            <line x1="400" y1="48" x2="400" y2="106" className="arch-line" />

            {/* intent engine diamond */}
            <rect
              x="388"
              y="112"
              width="24"
              height="24"
              transform="rotate(45 400 124)"
              className="arch-diamond"
            />
            <text x="400" y="164" className="arch-text arch-text-dim">
              AI INTENT ENGINE
            </text>

            {/* engine → venues */}
            <line x1="388" y1="130" x2="210" y2="216" className="arch-line arch-line-green" />
            <line x1="412" y1="130" x2="590" y2="216" className="arch-line arch-line-violet" />
            <text x="266" y="178" className="arch-label arch-label-green">
              buyShares()
            </text>
            <text x="534" y="178" className="arch-label arch-label-violet">
              swap()
            </text>

            {/* venue boxes */}
            <rect x="110" y="220" width="200" height="44" className="arch-box arch-box-green" />
            <text x="210" y="240" className="arch-text">
              OUTCOME VENUE
            </text>
            <text x="210" y="255" className="arch-label arch-label-dim">
              PARIMUTUEL · NATIVE OKB
            </text>

            <rect x="490" y="220" width="200" height="44" className="arch-box arch-box-violet" />
            <text x="590" y="240" className="arch-text">
              OKX DEX
            </text>
            <text x="590" y="255" className="arch-label arch-label-dim">
              AGGREGATOR · SPOT
            </text>

            {/* venues → x layer */}
            <line x1="210" y1="264" x2="330" y2="306" className="arch-line" />
            <line x1="590" y1="264" x2="470" y2="306" className="arch-line" />

            {/* x layer bar */}
            <rect x="250" y="300" width="300" height="36" className="arch-box arch-box-gold" />
            <text x="400" y="322" className="arch-text arch-text-gold">
              X LAYER EVM
            </text>

            {/* Signal packets. Every intent enters at the wallet, splits at
                the engine into an outcome leg and a hedge leg, and both come
                to rest on X Layer - so the diagram animates the claim the
                page is making rather than just decorating it. Negative begin
                offsets stagger the phases without leaving a gap on the
                first pass. */}
            <g className="arch-packets">
              {[
                { d: "M400,48 L400,106", cls: "", begin: "0s" },
                { d: "M400,48 L400,106", cls: "", begin: "-1.1s" },
                { d: "M388,130 L210,216", cls: "pkt-green", begin: "-0.35s" },
                { d: "M388,130 L210,216", cls: "pkt-green", begin: "-1.45s" },
                { d: "M412,130 L590,216", cls: "pkt-violet", begin: "-0.7s" },
                { d: "M412,130 L590,216", cls: "pkt-violet", begin: "-1.8s" },
                { d: "M210,264 L330,306", cls: "pkt-gold", begin: "-0.9s" },
                { d: "M590,264 L470,306", cls: "pkt-gold", begin: "-1.6s" },
              ].map((p, i) => (
                <circle key={i} r="2.6" className={`arch-packet ${p.cls}`}>
                  <animateMotion
                    dur="2.2s"
                    begin={p.begin}
                    repeatCount="indefinite"
                    path={p.d}
                    calcMode="linear"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.15;0.8;1"
                    dur="2.2s"
                    begin={p.begin}
                    repeatCount="indefinite"
                  />
                </circle>
              ))}
            </g>
          </svg>
        </div>
      </section>
    </>
  );
}
