import type { Band, GradedLevel, LevelBandSet, Perspective } from "@/lib/glossary/schema";
import { GRADED_LEVELS } from "@/lib/glossary/schema";
import { LEVEL_HEADERS } from "@/lib/glossary/bands";

const PERSPECTIVE_LABEL: Record<Perspective, string> = {
  batter: "打者視角",
  pitcher: "投手視角",
};

/** Range hint for a band given its ascending neighbours (raw numbers). */
function bandRange(bands: Band[], i: number): string {
  const prev = i > 0 ? bands[i - 1].max : undefined;
  const cur = bands[i].max;
  if (cur === undefined) return prev !== undefined ? `> ${prev}` : "全部";
  if (prev === undefined) return `≤ ${cur}`;
  return `${prev}–${cur}`;
}

function LevelColumn({ level, bands }: { level: GradedLevel; bands: Band[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{LEVEL_HEADERS[level]}</p>
      <ul className="space-y-1 text-sm">
        {bands.map((band, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3">
            <span>{band.label}</span>
            <span className="tabular-nums text-xs text-muted-foreground">{bandRange(bands, i)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PerspectiveBands({
  perspective,
  set,
  showLabel,
}: {
  perspective: Perspective;
  set: LevelBandSet;
  showLabel: boolean;
}) {
  return (
    <div>
      {showLabel && <p className="mb-2 text-sm font-medium">{PERSPECTIVE_LABEL[perspective]}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        {GRADED_LEVELS.map((level) => (
          <LevelColumn key={level} level={level} bands={set[level]} />
        ))}
      </div>
    </div>
  );
}

/**
 * The band table for the 判讀 layer (spec-02 §2.5): MLB/3A/2A columns, one
 * block per perspective (shared terms show 打者/投手 視角 both).
 */
export function BandsTable({
  bands,
}: {
  bands: { batter?: LevelBandSet; pitcher?: LevelBandSet };
}) {
  const present = (["batter", "pitcher"] as const).filter((p) => bands[p]);
  const showLabels = present.length > 1;
  return (
    <div className="mt-4 space-y-4">
      {present.map((p) => (
        <PerspectiveBands key={p} perspective={p} set={bands[p]!} showLabel={showLabels} />
      ))}
    </div>
  );
}
