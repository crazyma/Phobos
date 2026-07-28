import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadAllFrontmatter, loadFrontmatter } from "@/lib/glossary/content";
import { getMetricExamples } from "@/lib/glossary/examples-db";
import { getRegistry } from "@/lib/glossary/registry";
import type { Perspective } from "@/lib/glossary/schema";
import { BandsTable } from "@/components/glossary/bands-table";
import { GlossaryExamples } from "@/components/glossary/examples";

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
  return {
    title: `${term.name_zh}（${term.name_en}）— Phobos`,
    description: term.blurb,
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
  const picks = term.metric_keys.length > 0 ? await getMetricExamples(term) : [];

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">
          {term.name_zh}
          <span className="ml-2 text-lg font-normal text-muted-foreground">{term.name_en}</span>
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
      <section className="mt-6">
        <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-sm [&_blockquote]:text-muted-foreground [&_strong]:font-semibold">
          <Body />
        </div>
        {term.bands && <BandsTable bands={term.bands} />}
      </section>

      {/* Layer 2 — 定義算法（小字） */}
      {term.formula && (
        <section className="mt-8 text-sm text-muted-foreground">
          <h2 className="font-semibold text-foreground">定義</h2>
          <p className="mt-1">
            {term.name_zh}（{term.name_en}）
          </p>
          <p className="mt-1 font-mono text-xs">{term.formula}</p>
        </section>
      )}

      {/* Layer 3 — 延伸 */}
      <section className="mt-8 text-sm">
        <h2 className="font-semibold">延伸閱讀</h2>
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
      <GlossaryExamples picks={picks} />
    </article>
  );
}
