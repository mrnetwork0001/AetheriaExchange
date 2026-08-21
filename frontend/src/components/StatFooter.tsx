"use client";

import { useVenueChain } from "@/hooks/useVenueChain";
import { explorerAddressUrl, explorerBaseUrl } from "@/lib/chains";

const REPO = "https://github.com/mrnetwork0001/AetheriaExchange";

const PRODUCT = [
  { text: "Outcome Markets", href: "#markets" },
  { text: "AI Co-Pilot", href: "#copilot" },
  { text: "How It Works", href: "#how-it-works" },
  { text: "Architecture", href: "#architecture" },
];

// No faucet link: the venue is on mainnet and trades real OKB, so pointing
// visitors at a testnet faucet only misleads them about what they are about
// to stake.
const ECOSYSTEM = [
  { text: "OKX Web3 Wallet", href: "https://web3.okx.com" },
  { text: "OKX DEX", href: "https://web3.okx.com/dex-swap" },
  { text: "X Layer Docs", href: "https://web3.okx.com/xlayer/docs" },
];

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
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

  // The explorer link follows the venue chain, so it never sends a visitor
  // to the wrong network's explorer once mainnet is the live venue.
  const ecosystem = [
    { text: "X Layer Explorer", href: explorerBaseUrl(chainId ?? 1952) },
    ...ECOSYSTEM,
  ];

  const resources = [
    { text: "GitHub", href: REPO },
    { text: "Docs", href: "/docs" },
    { text: "Settlement Receipts", href: "/receipts" },
    venue
      ? {
          text: "Venue Contract",
          href: explorerAddressUrl(chainId ?? 1952, venue),
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
              href="https://t.me/AetheriaExBot"
              target="_blank"
              rel="noreferrer"
              aria-label="Aetheria co-pilot on Telegram"
            >
              <TelegramIcon />
            </a>
            <a
              href="https://github.com/mrnetwork0001"
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
            {ecosystem.map((l) => (
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
