"use client";

import { useVenueChain } from "@/hooks/useVenueChain";

const REPO = "https://github.com/AetheriaEx/AetheriaExchange";

const PRODUCT = [
  { text: "Outcome Markets", href: "#markets" },
  { text: "AI Co-Pilot", href: "#copilot" },
  { text: "How It Works", href: "#how-it-works" },
  { text: "Architecture", href: "#architecture" },
];

const ECOSYSTEM = [
  { text: "X Layer Explorer", href: "https://www.oklink.com/xlayer-test" },
  { text: "OKX Web3 Wallet", href: "https://web3.okx.com" },
  { text: "OKX DEX", href: "https://web3.okx.com/dex-swap" },
  { text: "X Layer Faucet", href: "https://web3.okx.com/xlayer/faucet" },
];

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function StatFooter() {
  // The venue link always points at the chain that actually has the venue,
  // whatever chain the visitor's wallet is parked on.
  const { chainId, address: venue } = useVenueChain();
  const explorerBase =
    chainId === 196
      ? "https://www.oklink.com/xlayer"
      : "https://www.oklink.com/xlayer-test";

  const resources = [
    { text: "GitHub", href: REPO },
    { text: "Docs", href: "/docs" },
    { text: "Settlement Receipts", href: "/receipts" },
    { text: "X Layer Docs", href: "https://web3.okx.com/xlayer/docs" },
    venue
      ? {
          text: "Venue Contract",
          href: `${explorerBase}/address/${venue}`,
        }
      : { text: "Venue Contract - deploying", href: null },
  ];

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/aetheria-header.png"
              alt="Aetheria Exchange"
              className="brand-logo brand-logo-footer"
            />
          </div>
          <p className="footer-desc">
            Event-driven outcome markets with an AI trading co-pilot on X
            Layer. Your market view parsed against live odds, paired with a
            correlated OKX DEX hedge - returned as a signable,
            self-custodied ticket.
          </p>
          <div className="footer-social">
            <a
              href="https://x.com/AetheriaEx"
              target="_blank"
              rel="noreferrer"
              aria-label="Aetheria on X"
            >
              <XIcon />
            </a>
            <a
              href="https://github.com/AetheriaEx"
              target="_blank"
              rel="noreferrer"
              aria-label="Aetheria on GitHub"
            >
              <GitHubIcon />
            </a>
          </div>
        </div>

        <div className="footer-col">
          <span className="label">PRODUCT</span>
          <nav>
            {PRODUCT.map((l) => (
              <a key={l.text} href={l.href}>
                {l.text}
              </a>
            ))}
          </nav>
        </div>

        <div className="footer-col">
          <span className="label">ECOSYSTEM</span>
          <nav>
            {ECOSYSTEM.map((l) => (
              <a key={l.text} href={l.href} target="_blank" rel="noreferrer">
                {l.text}
              </a>
            ))}
          </nav>
        </div>

        <div className="footer-col">
          <span className="label">RESOURCES</span>
          <nav>
            {resources.map((l) =>
              l.href ? (
                <a key={l.text} href={l.href} target="_blank" rel="noreferrer">
                  {l.text}
                </a>
              ) : (
                <span key={l.text} className="footer-dead">
                  {l.text}
                </span>
              )
            )}
          </nav>
        </div>
      </div>

    </footer>
  );
}
