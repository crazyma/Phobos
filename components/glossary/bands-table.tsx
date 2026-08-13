import type { Band, GradedLevel, LevelBandSet, Perspective } from "@/lib/glossary/schema";
import { GRADED_LEVELS } from "@/lib/glossary/schema";
import { LEVEL_HEADERS } from "@/lib/glossary/bands";
import { LevelBadge } from "@/components/magazine/level-badge";

const PERSPECTIVE_LABEL: Record<Perspective, string> = { batter: "打者視角", pitcher: "投手視角" };

/** Range hint for a band given its ascending neighbours (raw numbers). */
export function bandRange(bands: Band[], i: number): string {
  const prev = i > 0 ? bands[i - 1].max : undefined;
  const cur = bands[i].max;
  if (cur === undefined) return prev !== undefined ? `> ${prev}` : "全部";
  if (prev === undefined) return `≤ ${cur}`;
  return `${prev}–${cur}`;
}

function segmentWidths(bands: Band[]): number[] {
  const finite = bands.map((band, i) => {
    if (band.max !== undefined) return band.max;
    const previous = bands[i - 1]?.max ?? 0;
    const previousWidth = i > 1 ? previous - (bands[i - 2]?.max ?? 0) : Math.max(previous, 1);
    return previous + previousWidth;
  });
  return bands.map((band, i) => {
    if (bands.length === 1) return 1;
    if (i === 0) return Math.max((finite[1] ?? 1) - (finite[0] ?? 0), 0.001);
    if (band.max === undefined) return Math.max((finite[i - 1] ?? 0) - (finite[i - 2] ?? 0), 0.001);
    return Math.max((finite[i] ?? 0) - (finite[i - 1] ?? 0), 0.001);
  });
}

function BandScale({ bands, higherIsBetter }: { bands: Band[]; higherIsBetter: boolean }) {
  const widths = segmentWidths(bands);
  const total = widths.reduce((sum, width) => sum + width, 0);
  return <div className="mt-3"><div className="flex h-12 overflow-hidden rounded-lg border border-border">{bands.map((band, i) => { const good = higherIsBetter ? i === bands.length - 1 : i === 0; const tone = good ? "bg-up text-primary-foreground" : i === (higherIsBetter ? 0 : bands.length - 1) ? "bg-down text-primary-foreground" : "bg-muted text-foreground"; return <div key={i} style={{ width: `${(widths[i] / total) * 100}%` }} className={`flex min-w-0 items-center justify-center px-1 text-center font-mono text-[10px] font-bold ${tone}`} title={`${band.label}（${bandRange(bands, i)}）`}>{band.label}</div>; })}</div><div className="flex">{bands.map((band, i) => band.max === undefined ? null : <span key={i} style={{ width: `${(widths[i] / total) * 100}%` }} className="border-l border-border pt-1 pl-1 font-mono text-[9px] text-muted-foreground">{band.max}</span>)}</div><p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">數字越{higherIsBetter ? "高" : "低"}越好</p></div>;
}

function PerspectiveBands({ perspective, set, higherIsBetter, showLabel }: { perspective: Perspective; set: LevelBandSet; higherIsBetter: boolean; showLabel: boolean }) {
  return <div className="mt-8">{showLabel && <h3 className="font-serif text-xl font-black">{PERSPECTIVE_LABEL[perspective]}</h3>}<div className="space-y-5">{GRADED_LEVELS.map((level) => <div key={level} className="grid gap-3 sm:grid-cols-[5rem_1fr] sm:items-start"><LevelBadge level={level} /><BandScale bands={set[level]} higherIsBetter={higherIsBetter} /></div>)}</div></div>;
}

export function BandsTable({ bands, higherIsBetter, higherIsBetterPitcher }: { bands: { batter?: LevelBandSet; pitcher?: LevelBandSet }; higherIsBetter: boolean; higherIsBetterPitcher?: boolean }) {
  const present = (["batter", "pitcher"] as const).filter((p) => bands[p]);
  return <div className="mt-8 border-t border-border pt-2">{present.map((perspective) => <PerspectiveBands key={perspective} perspective={perspective} set={bands[perspective]!} higherIsBetter={perspective === "pitcher" ? (higherIsBetterPitcher ?? higherIsBetter) : higherIsBetter} showLabel={present.length > 1} />)}</div>;
}
