import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadAllFrontmatter, loadFrontmatter } from "@/lib/glossary/content";
import { getMetricExamples, getRosterExamples } from "@/lib/glossary/examples-db";
import { getRegistry } from "@/lib/glossary/registry";
import type { Perspective } from "@/lib/glossary/schema";
import { BandsTable } from "@/components/glossary/bands-table";
import { GlossaryExamples } from "@/components/glossary/examples";
import { RosterExamples } from "@/components/glossary/roster-examples";
import { glossaryShareMetadata } from "@/lib/seo/open-graph";

// Prerendered term pages; unknown slugs 404 (spec-02 §2.5). A build renders
// every page, so getRegistry()'s coverage check runs here (spec-04 §D
// build-fail). ISR refreshes the example backlinks as the ETL updates data.
export const revalidate = 1800;
export const dynamicParams = false;

const PERSPECTIVE_LABEL: Record<Perspective, string> = { batter: "打者", pitcher: "投手" };

export function generateStaticParams() {
  return loadAllFrontmatter().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const term = loadFrontmatter(slug);
  if (!term) return { title: "找不到名詞 — Phobos" };
  const share = glossaryShareMetadata(term);
  return {
    title: `${term.name_zh}（${term.name_en}）— Phobos`,
    description: term.blurb,
    openGraph: share.openGraph,
    twitter: share.twitter,
  };
}

export default async function GlossaryTermPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const term = loadFrontmatter(slug);
  if (!term) notFound();

  // Touch the registry so any coverage gap fails the build (spec-04 §D).
  getRegistry();

  const { default: Body } = await import(`../../../content/glossary/${slug}.mdx`);
  const metricPicks = term.metric_keys.length > 0 ? await getMetricExamples(term) : [];
  const rosterPicks = term.category === "roster" ? await getRosterExamples(term) : [];

  return (
    <article className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-16">
      <header>
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">BASEBALL GLOSSARY</p>
        <h1 className="font-serif text-5xl font-black tracking-tight">
          {term.name_zh}
          <span className="ml-3 font-mono text-base font-normal uppercase tracking-widest text-accent">{term.name_en}</span>
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {term.applies_to.map((p) => (
            <span key={p} className="rounded-full border border-border px-2 py-0.5">
              {PERSPECTIVE_LABEL[p]}
            </span>
          ))}
        </div>
      </header>

      {/* Layer 1 — 判讀（白話 + 分布 + 級距表） */}
      <section className="mt-10">
        <h2 className="mb-4 border-b-2 border-foreground pb-3 font-mono text-xs font-bold uppercase tracking-[0.2em]">導讀</h2>
        <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-sm [&_blockquote]:text-muted-foreground [&_strong]:font-semibold">
          <Body />
        </div>
        {term.bands && <><h2 className="mt-12 border-b-2 border-foreground pb-3 font-mono text-xs font-bold uppercase tracking-[0.2em]">數據高低比較</h2><BandsTable bands={term.bands} higherIsBetter={term.higher_is_better} higherIsBetterPitcher={term.higher_is_better_pitcher} /></>}
      </section>

      {/* Layer 2 — 定義算法（小字） */}
      {term.formula && (
        <section className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-foreground">定義算法</h2>
          <p className="mt-1">
            {term.name_zh}（{term.name_en}）
          </p>
          <p className="mt-1 font-mono text-xs">{term.formula}</p>
        </section>
      )}

      {/* Layer 3 — 延伸 */}
      <section className="mt-12 border-t border-border pt-6 text-sm">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em]">延伸參考</h2>
        <ul className="mt-2 space-y-1">
          {term.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline hover:text-foreground">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Layer 4 — 範例球員回連 */}
      <GlossaryExamples picks={metricPicks} />
      <RosterExamples picks={rosterPicks} />
    </article>
  );
}
