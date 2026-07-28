import Link from "next/link";
import type { ExamplePick } from "@/lib/glossary/examples";

/**
 * Example-player backlinks (spec-02 §2.5 zone 4 / spec-04 §E). Rendered only
 * when the picker found qualifying Taiwanese players; an empty list means the
 * caller hides this block entirely.
 */
export function GlossaryExamples({ picks }: { picks: ExamplePick[] }) {
  if (picks.length === 0) return null;
  return (
    <section className="mt-8 rounded-md bg-muted px-4 py-3">
      <h2 className="text-sm font-semibold text-muted-foreground">範例球員（本季）</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {picks.map((p) => (
          <li key={p.playerId}>
            <Link href={`/players/${p.playerId}`} className="font-medium hover:underline">
              {p.name}
            </Link>
            <span className="text-muted-foreground">
              {" "}本季 {p.value}（{p.levelHeader}，{p.bandLabel}）
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
