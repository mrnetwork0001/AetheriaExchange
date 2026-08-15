import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

// Absolute URLs for social cards. NEXT_PUBLIC_SITE_URL wins (set it to the
// production domain); VERCEL_URL covers preview deploys; localhost is the
// dev fallback. Malformed values fall through rather than crashing the
// build - a broken OG tag is recoverable, a failed deploy is not.
function resolveSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];
  for (const raw of candidates) {
    const v = raw?.trim();
    if (!v) continue;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      new URL(withScheme);
      return withScheme;
    } catch {
      /* try the next candidate */
    }
  }
  return "http://localhost:3000";
}
const siteUrl = resolveSiteUrl();

const DESCRIPTION =
  "A market you can ask. A hedge you can click. AI-run prediction markets on X Layer - the AI trades, creates, makes and settles them. Non-custodial.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Aetheria Exchange",
  description: DESCRIPTION,
  openGraph: {
    title: "Aetheria Exchange",
    description: DESCRIPTION,
    url: siteUrl,
    siteName: "Aetheria Exchange",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@AetheriaEx",
    title: "Aetheria Exchange",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
