import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import type { Metadata } from "next";
import { ALL_PAGES, DOC_SECTIONS } from "../manifest";

// Fully static: every docs page is rendered to HTML at build time from the
// markdown in docs-content/ - no client JS for prose, no runtime fs reads
// on a warm serverless path.
export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_PAGES.map((p) => ({
    slug: p.slug === "" ? undefined : p.slug.split("/"),
  }));
}

function resolvePage(slugParts?: string[]) {
  const slug = (slugParts ?? []).join("/");
  return ALL_PAGES.find((p) => p.slug === slug) ?? null;
}

export function generateMetadata({
  params,
}: {
  params: { slug?: string[] };
}): Metadata {
  const page = resolvePage(params.slug);
  if (!page) return {};
  return {
    title: `${page.title} · Aetheria Docs`,
    description: page.description,
  };
}

export default function DocsPage({ params }: { params: { slug?: string[] } }) {
  const page = resolvePage(params.slug);
  if (!page) notFound();

  const filePath = path.join(process.cwd(), "docs-content", page.file);
  const markdown = fs.readFileSync(filePath, "utf8");
  const html = marked.parse(markdown, { async: false }) as string;

  const idx = ALL_PAGES.findIndex((p) => p.slug === page.slug);
  const prev = idx > 0 ? ALL_PAGES[idx - 1] : null;
  const next = idx < ALL_PAGES.length - 1 ? ALL_PAGES[idx + 1] : null;

  return (
    <div className="docs-shell">
      <header className="docs-header">
        <Link href="/" className="docs-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aetheria-header.png" alt="Aetheria Exchange" />
        </Link>
        <nav className="docs-header-links">
          <Link href="/">APP</Link>
          <Link href="/?tab=agents">AGENT OPS</Link>
          <a
            href="https://github.com/AetheriaEx/AetheriaExchange"
            target="_blank"
            rel="noreferrer"
          >
            GITHUB
          </a>
        </nav>
      </header>

      <div className="docs-body">
        <aside className="docs-sidebar">
          {DOC_SECTIONS.map((section) => (
            <div key={section.label} className="docs-section">
              <span className="label docs-section-label">{section.label}</span>
              <nav>
                {section.pages.map((p) => (
                  <Link
                    key={p.slug}
                    href={p.slug ? `/docs/${p.slug}` : "/docs"}
                    className={`docs-link ${p.slug === page.slug ? "active" : ""}`}
                  >
                    {p.title}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </aside>

        <main className="docs-main">
          <article
            className="docs-prose"
            // Rendered at build time from our own markdown files - no user
            // content flows through this path.
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <nav className="docs-pager">
            {prev ? (
              <Link href={prev.slug ? `/docs/${prev.slug}` : "/docs"}>
                ← {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/docs/${next.slug}`}>{next.title} →</Link>
            ) : (
              <span />
            )}
          </nav>
        </main>
      </div>
    </div>
  );
}
