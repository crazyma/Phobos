"use client";

import Link from "next/link";
import { Search, Trophy, X } from "lucide-react";
import { useMemo, useState, type ComponentType, type SVGProps } from "react";
import { EmptyState } from "@/components/magazine/empty-state";
import { BatIcon, BaseballIcon, DiamondIcon, HomePlateIcon } from "@/components/magazine/baseball-icons";
import { GLOSSARY_CATEGORIES, type Frontmatter, type GlossaryCategory } from "@/lib/glossary/schema";

const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  batting_adv: "打擊進階",
  pitching_adv: "投球進階",
  shared_adv: "打投共用進階",
  standard: "標準數據",
  roster: "名單與規則",
};

/**
 * One distinct icon per category, following the design's mapping (bat / ball /
 * trophy / home plate); `standard` has no design counterpart, so it takes the
 * diamond. `GloveIcon` stays unused until a 防守數據 category exists.
 */
const CATEGORY_ICONS = {
  batting_adv: BatIcon,
  pitching_adv: BaseballIcon,
  shared_adv: Trophy,
  standard: DiamondIcon,
  roster: HomePlateIcon,
} satisfies Record<GlossaryCategory, ComponentType<SVGProps<SVGSVGElement>>>;

export function filterGlossaryTerms(terms: Frontmatter[], query: string): Frontmatter[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return terms;
  return terms.filter((term) =>
    [term.name_zh, term.name_en, term.blurb].some((text) => text.toLocaleLowerCase().includes(normalized)),
  );
}

export function GlossaryIndexClient({ terms }: { terms: Frontmatter[] }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => filterGlossaryTerms(terms, normalized), [normalized, terms]);

  return (
    <div className="mt-10">
      <label className="relative block">
        <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋名詞、縮寫或關鍵字"
          className="w-full rounded-xl border-2 border-border bg-card py-4 pl-12 pr-12 font-sans outline-none transition focus:border-accent"
        />
        {query && (
          <button
            type="button"
            aria-label="清除搜尋"
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        )}
      </label>
      <p className="mt-3 font-mono text-xs text-muted-foreground">找到 {filtered.length} 則結果</p>
      {filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="找不到相關名詞" description="試試其他縮寫或關鍵字。" />
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {GLOSSARY_CATEGORIES.map((category) => {
            const group = filtered.filter((term) => term.category === category);
            if (!group.length) return null;
            const Icon = CATEGORY_ICONS[category];

            return (
              <section key={category}>
                <div className="flex items-center justify-between border-b-2 border-foreground pb-3">
                  <div className="flex items-center gap-3">
                    <Icon className="size-6 text-accent" aria-hidden="true" />
                    <h2 className="font-serif text-2xl font-black">{CATEGORY_LABELS[category]}</h2>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{group.length} 則</span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((term) => (
                    <Link
                      key={term.slug}
                      href={`/glossary/${term.slug}`}
                      className="group rounded-xl border border-border bg-card p-5 transition hover:-translate-y-1 hover:border-accent"
                    >
                      <h3 className="font-serif text-xl font-black group-hover:text-accent">{term.name_zh}</h3>
                      <p className="mt-1 font-mono text-xs uppercase tracking-widest text-accent">{term.name_en}</p>
                      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{term.blurb}</p>
                      <span className="mt-5 block font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-accent">
                        閱讀全文 →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
