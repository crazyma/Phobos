import type { Band, LevelBandSet, Perspective } from "@/lib/glossary/schema";
import { GRADED_LEVELS } from "@/lib/glossary/schema";
import { LevelBadge } from "@/components/magazine/level-badge";

const PERSPECTIVE_LABEL: Record<Perspective, string> = {
  batter: "打者視角",
  pitcher: "投手視角",
};

/**
 * The design's warm-amber ramp (`glossary-page.tsx` ScaleBar). Deliberately not
 * `bg-up`/`bg-down`: green/red already mean rise/fall and win/loss site-wide
 * (transaction timeline, home-page 異動快訊, 近期戰績), so reusing them for
 * "good band / bad band" would read as the wrong vocabulary.
 */
const TONE_CLASS = {
  low: "bg-muted",
  mid: "bg-accent/40",
  high: "bg-accent",
} as const;

type Tone = keyof typeof TONE_CLASS;

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

/** Fraction → CSS percentage, trimmed so float noise (20.000000000000004%) never reaches the DOM. */
function pct(fraction: number): string {
  return `${Number((fraction * 100).toFixed(4))}%`;
}

/**
 * Tone by position + direction. Our `Band` carries no `tone` of its own (the
 * design's fixture data does): the worst end is `low`, the best end is `high`,
 * everything between is `mid`. Which end is "best" flips with `higherIsBetter`,
 * which the pitcher view overrides via `higher_is_better_pitcher`. A lone band
 * is neither end, so it stays `mid`.
 */
export function bandTones(count: number, higherIsBetter: boolean): Tone[] {
  const best = higherIsBetter ? count - 1 : 0;
  const worst = higherIsBetter ? 0 : count - 1;
  return Array.from({ length: count }, (_, i) => {
    if (count === 1) return "mid";
    if (i === best) return "high";
    if (i === worst) return "low";
    return "mid";
  });
}

export type ScaleGeometry = {
  /** Each segment's share of the bar, as a fraction summing to 1. */
  widths: number[];
  /** Interior boundaries, offset from the left edge as a fraction of the bar. */
  seams: { value: number; offset: number }[];
};

/**
 * Geometry for one scale. Both ends of a band set are open ranges, so unlike
 * the design's ScaleBar there is no real min/max to interpolate a value
 * against — a seam sits at the *cumulative* width of everything to its left.
 * Only interior seams are drawn: the schema keeps `max` on every band but the
 * last, and the bar's outer edges are synthetic (see `segmentWidths`).
 */
export function scaleGeometry(bands: Band[]): ScaleGeometry {
  const raw = segmentWidths(bands);
  const total = raw.reduce((sum, width) => sum + width, 0);
  const widths = raw.map((width) => width / total);
  const seams: ScaleGeometry["seams"] = [];
  let offset = 0;
  bands.forEach((band, i) => {
    offset += widths[i];
    if (i < bands.length - 1 && band.max !== undefined) {
      seams.push({ value: band.max, offset });
    }
  });
  return { widths, seams };
}

function BandScale({ bands, higherIsBetter }: { bands: Band[]; higherIsBetter: boolean }) {
  const { widths, seams } = scaleGeometry(bands);
  const tones = bandTones(bands.length, higherIsBetter);

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex">
        {bands.map((band, i) => (
          <div
            key={i}
            className="text-center"
            style={{ width: pct(widths[i]) }}
            title={`${band.label}（${bandRange(bands, i)}）`}
          >
            <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-foreground">
              {band.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {bands.map((band, i) => (
          <div key={i} className={TONE_CLASS[tones[i]]} style={{ width: pct(widths[i]) }} />
        ))}
      </div>
      <div className="relative mt-1.5 h-4">
        {seams.map((seam) => (
          <span
            key={seam.value}
            className="absolute top-0 -translate-x-1/2 font-mono text-[11px] text-muted-foreground"
            style={{ left: pct(seam.offset) }}
          >
            {seam.value}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        數字越{higherIsBetter ? "高" : "低"}越好
      </p>
    </div>
  );
}

function PerspectiveBands({
  perspective,
  set,
  higherIsBetter,
  showLabel,
}: {
  perspective: Perspective;
  set: LevelBandSet;
  higherIsBetter: boolean;
  showLabel: boolean;
}) {
  return (
    <div className="mt-8">
      {showLabel && <h3 className="font-serif text-xl font-black">{PERSPECTIVE_LABEL[perspective]}</h3>}
      <div className="space-y-5">
        {GRADED_LEVELS.map((level) => (
          <div key={level} className="grid gap-3 sm:grid-cols-[5rem_1fr] sm:items-start">
            <LevelBadge level={level} />
            <BandScale bands={set[level]} higherIsBetter={higherIsBetter} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BandsTable({
  bands,
  higherIsBetter,
  higherIsBetterPitcher,
}: {
  bands: { batter?: LevelBandSet; pitcher?: LevelBandSet };
  higherIsBetter: boolean;
  higherIsBetterPitcher?: boolean;
}) {
  const present = (["batter", "pitcher"] as const).filter((p) => bands[p]);

  return (
    <div className="mt-8 border-t border-border pt-2">
      {present.map((perspective) => (
        <PerspectiveBands
          key={perspective}
          perspective={perspective}
          set={bands[perspective]!}
          higherIsBetter={perspective === "pitcher" ? (higherIsBetterPitcher ?? higherIsBetter) : higherIsBetter}
          showLabel={present.length > 1}
        />
      ))}
    </div>
  );
}
