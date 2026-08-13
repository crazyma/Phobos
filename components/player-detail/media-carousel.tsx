"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Newspaper, Play } from "lucide-react";
import type { MockMediaItem } from "@/lib/services/media.mock";

const kindLabel: Record<MockMediaItem["kind"], string> = {
  news: "新聞",
  thread: "討論串",
  tweet: "社群",
  video: "影片",
};

export function MediaCarousel({ items }: { items: MockMediaItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  function updateArrows() {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">IN THE MEDIA</p>
          <h2 className="font-serif text-3xl font-black tracking-tight">媒體與新聞集錦</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="向左瀏覽" disabled={!canLeft} onClick={() => trackRef.current?.scrollBy({ left: -280, behavior: "smooth" })} className="flex size-9 items-center justify-center rounded-full border border-border transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="size-4" /></button>
          <button type="button" aria-label="向右瀏覽" disabled={!canRight} onClick={() => trackRef.current?.scrollBy({ left: 280, behavior: "smooth" })} className="flex size-9 items-center justify-center rounded-full border border-border transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div ref={trackRef} className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <a key={item.id} href={item.url} target={item.url === "#" ? undefined : "_blank"} rel={item.url === "#" ? undefined : "noopener noreferrer"} className="group flex w-[280px] shrink-0 flex-col rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-1 hover:border-accent hover:shadow-lg">
            <div className="mb-3 flex items-center gap-2">
              {item.kind === "video" ? <Play className="size-4 text-accent" /> : <Newspaper className="size-4 text-accent" />}
              <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{kindLabel[item.kind]}</span>
              <time className="ml-auto font-mono text-[10px] text-muted-foreground">{item.date}</time>
            </div>
            <h3 className="font-serif text-lg font-black leading-snug">{item.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
            <span className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-accent">查看原文 <ArrowUpRight className="size-3.5" /></span>
          </a>
        ))}
      </div>
    </section>
  );
}
