import type { Metadata } from "next";
import Link from "next/link";
import { loadAllFrontmatter } from "@/lib/glossary/content";
import { GLOSSARY_CATEGORIES, type GlossaryCategory } from "@/lib/glossary/schema";

// Fully static index (spec-02 §2.4); content changes ship with a new build.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "棒球名詞 — Phobos",
  description: "台灣球員大聯盟網站的棒球名詞庫：進階數據、標準數據與名單規則的白話解說。",
};

const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  batting_adv: "打擊進階",
  pitching_adv: "投球進階",
  shared_adv: "打投共用進階",
  standard: "標準數據",
  roster: "名單與規則",
};

export default function GlossaryIndex() {
  const terms = loadAllFrontmatter();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">棒球名詞</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        看數據時遇到不懂的名詞，點進來用白話讀懂它，並對照大聯盟／3A／2A 的級距。
      </p>

      <div className="mt-8 space-y-8">
        {GLOSSARY_CATEGORIES.map((category) => {
          const group = terms.filter((t) => t.category === category);
          if (group.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="text-lg font-semibold">{CATEGORY_LABELS[category]}</h2>
              <ul className="mt-3 space-y-3">
                {group.map((term) => (
                  <li key={term.slug}>
                    <Link href={`/glossary/${term.slug}`} className="group block">
                      <span className="font-medium group-hover:underline">
                        {term.name_zh}
                        <span className="ml-1 text-muted-foreground">（{term.name_en}）</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {term.blurb}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
