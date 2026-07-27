import type { Timeline } from "@/lib/services";

/**
 * Zone 4 (spec-02 §2.3): the transaction timeline, newest first. Each entry
 * shows the date, a zh type badge, and the raw description.
 */
export function Timeline({ timeline }: { timeline: Timeline }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">動態時間軸</h2>
      {timeline.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">尚無異動紀錄。</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {timeline.map((e, i) => (
            <li key={`${e.date}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <time className="w-20 shrink-0 tabular-nums text-muted-foreground">
                {e.date}
              </time>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
                {e.typeLabel}
              </span>
              {e.description && (
                <span className="text-muted-foreground">{e.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
