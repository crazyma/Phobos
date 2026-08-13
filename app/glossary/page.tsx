import type { Metadata } from "next";
import { loadAllFrontmatter } from "@/lib/glossary/content";
import { GlossaryIndexClient } from "@/components/glossary/glossary-index-client";

// Fully static index (spec-02 §2.4); content changes ship with a new build.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "棒球名詞 — Phobos",
  description: "台灣球員大聯盟網站的棒球名詞庫：進階數據、標準數據與名單規則的白話解說。",
};

export default function GlossaryIndex() {
  const terms = loadAllFrontmatter();

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-16">
      <header className="grid gap-6 border-b-2 border-foreground pb-10 md:grid-cols-[1.5fr_1fr] md:items-end">
        <h1 className="font-serif text-5xl font-black leading-none tracking-tight md:text-7xl">棒球<span className="text-accent">名詞</span></h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground md:justify-self-end">
        看數據時遇到不懂的名詞，點進來用白話讀懂它，並對照大聯盟／3A／2A 的級距。
        </p>
      </header>
      <GlossaryIndexClient terms={terms} />
    </main>
  );
}
