import type { Timeline } from "@/lib/services";
import { eventTone } from "@/components/magazine/event-tone";

/**
 * Zone 4 (spec-02 §2.3): the transaction timeline, newest first. Each entry
 * shows the date, a zh type badge, and the raw description.
 */
export function Timeline({ timeline }: { timeline: Timeline }) {
  return (
    <section className="mt-16">
      <div className="mb-6">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">TRANSACTIONS</p>
        <h2 className="font-serif text-3xl font-black tracking-tight">動態時間軸</h2>
      </div>
      {timeline.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">尚無異動紀錄。</p>
      ) : (
        <ul className="space-y-1 border-t-2 border-foreground">
          {timeline.map((e, i) => (
            <li key={`${e.date}-${i}`} className="grid gap-3 border-b border-border py-4 sm:grid-cols-[7rem_1fr]">
              <time className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
                {e.date}
              </time>
              <div>
                <span className={eventTone(e.type) === "up" ? "font-serif text-lg font-black text-up" : eventTone(e.type) === "down" ? "font-serif text-lg font-black text-down" : "font-serif text-lg font-black text-foreground"}>
                  {e.typeLabel}
                </span>
                {e.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{e.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
