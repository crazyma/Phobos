import Link from "next/link";
import type { RosterPick } from "@/lib/glossary/examples";

/** Optional recent-transaction backlink for roster and rules explainers. */
export function RosterExamples({ picks }: { picks: RosterPick[] }) {
  if (picks.length === 0) return null;
  return (
    <section className="mt-8 rounded-md bg-muted px-4 py-3">
      <h2 className="text-sm font-semibold text-muted-foreground">最近有此類異動的球員</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {picks.map((pick) => (
          <li key={pick.playerId}>
            <Link href={`/players/${pick.playerId}`} className="font-medium hover:underline">
              {pick.name}
            </Link>
            <span className="text-muted-foreground"> {pick.date}・{pick.typeLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
