// Documentation manifest: order, grouping, and file binding for /docs.
// Content lives as markdown in frontend/docs-content/ and is rendered
// server-side at build time - zero client JS for prose.

export interface DocPage {
  slug: string; // "" = /docs index
  title: string;
  description: string;
  file: string;
}

export interface DocSection {
  label: string;
  pages: DocPage[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    label: "GETTING STARTED",
    pages: [
      {
        slug: "",
        title: "Welcome to Aetheria",
        description: "What Aetheria Exchange is and where everything lives",
        file: "welcome.md",
      },
      {
        slug: "how-it-works",
        title: "How It Works",
        description: "The full lifecycle: ask, ticket, execute, settle",
        file: "how-it-works.md",
      },
    ],
  },
  {
    label: "PROTOCOL",
    pages: [
      {
        slug: "parimutuel",
        title: "Parimutuel Markets",
        description: "Pool mechanics, payout math, fees, and refunds",
        file: "parimutuel.md",
      },
      {
        slug: "resolution",
        title: "Resolution & Settlement",
        description: "How markets settle, the guards, and the escape hatch",
        file: "resolution.md",
      },
      {
        slug: "contracts-api",
        title: "Contracts & HTTP API",
        description: "OutcomeMarket reference, addresses, and API routes",
        file: "contracts-api.md",
      },
    ],
  },
  {
    label: "THE AI FLEET",
    pages: [
      {
        slug: "agents",
        title: "The Four Agents",
        description: "Co-pilot, drafter, market maker, resolver - and how they run",
        file: "agents.md",
      },
      {
        slug: "copilot",
        title: "The AI Co-Pilot",
        description: "Intents, hedging rules, voice, and persistent memory",
        file: "copilot.md",
      },
    ],
  },
  {
    label: "EXECUTION",
    pages: [
      {
        slug: "okx-execution",
        title: "OKX DEX Execution",
        description: "The two hedge routes and the anti-wash stance",
        file: "okx-execution.md",
      },
    ],
  },
  {
    label: "OPERATE",
    pages: [
      {
        slug: "self-hosting",
        title: "Self-Hosting & Deployment",
        description: "Environment, hosting topology, and the VPS fleet",
        file: "self-hosting.md",
      },
    ],
  },
  {
    label: "TRUST",
    pages: [
      {
        slug: "trust-model",
        title: "Trust Model & FAQ",
        description: "What is trusted, what is not, and honest limitations",
        file: "trust-model.md",
      },
    ],
  },
];

export const ALL_PAGES: DocPage[] = DOC_SECTIONS.flatMap((s) => s.pages);
