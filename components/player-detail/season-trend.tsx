import { LevelBadge } from "@/components/magazine/level-badge";
import { type PlayerTrend } from "@/lib/services/player-trend";

type Point = { value: number };

export function trendTone(
  points: Point[],
  higherIsBetter: boolean,
): "up" | "down" | "neutral" {
  const first = points[0]?.value;
  const latest = points.at(-1)?.value;
  if (first === undefined || latest === undefined || first === latest) return "neutral";
  if (higherIsBetter) return latest > first ? "up" : "down";
  return latest < first ? "up" : "down";
}

function Sparkline({ points, higherIsBetter }: { points: Point[]; higherIsBetter: boolean }) {
  if (points.length === 0) return null;

  const width = 640;
  const height = 140;
  const padding = 8;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = points.length === 1 ? 0 : (width - padding * 2) / (points.length - 1);
  const path = values
    .map((value, index) => {
      const x = padding + index * step;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const tone = trendTone(points, higherIsBetter);
  const colorClass = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-accent";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`mt-5 h-32 w-full ${colorClass}`}
      role="img"
      aria-label="季內累積數據走勢"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={padding + (points.length - 1) * step}
        cy={height - padding - ((values.at(-1)! - min) / range) * (height - padding * 2)}
        r="5"
        fill="currentColor"
      />
    </svg>
  );
}

function TrendCard({
  series,
  title,
  metric,
  higherIsBetter,
  decimalPlaces,
}: {
  series: PlayerTrend["batting"][number];
  title: string;
  /** 指標縮寫（AVG／ERA），放上排小標；`title` 是下方 h3 的完整敘述。 */
  metric: string;
  higherIsBetter: boolean;
  decimalPlaces: number;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      {/* 上排是層級＋指標縮寫；完整標題只出現在下方的 h3，不要兩處重複。 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LevelBadge level={series.level} />
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {metric}
        </p>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <h3 className="font-serif text-xl font-black">{title}</h3>
        <p className="font-mono text-4xl font-black leading-none tabular-nums">
          {series.latest.toFixed(decimalPlaces)}
        </p>
      </div>
      <Sparkline points={series.points} higherIsBetter={higherIsBetter} />
    </article>
  );
}

/** Season-to-date trend cards. Hidden entirely until a level clears its sample threshold. */
export function SeasonTrend({ trend }: { trend: PlayerTrend }) {
  if (trend.batting.length === 0 && trend.pitching.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="mb-6">
        <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">SEASON TREND</p>
        <h2 className="font-serif text-3xl font-black tracking-tight">本季累積走勢</h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {trend.batting.map((series) => (
          <TrendCard
            key={`bat-${series.level}`}
            series={series}
            title="本季累積打擊率走勢"
            metric="AVG"
            higherIsBetter
            decimalPlaces={3}
          />
        ))}
        {trend.pitching.map((series) => (
          <TrendCard
            key={`pit-${series.level}`}
            series={series}
            title="本季累積自責分率走勢"
            metric="ERA"
            higherIsBetter={false}
            decimalPlaces={2}
          />
        ))}
      </div>
    </section>
  );
}
