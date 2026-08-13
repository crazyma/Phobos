import { LevelBadge } from "@/components/magazine/level-badge";
import { type PlayerTrend } from "@/lib/services/player-trend";

type Point = { value: number };

/**
 * 走勢線一律用 `--accent`，**不做方向配色**。曾經以 `points[0]`（第一場的累積
 * 值）當基準判斷綠／紅，但第一個累積點只根據一場（打者約 4 個打數）算出來，
 * 數值極端：鄭宗哲首戰累積打擊率偏高，於是 3A `.246` 與大聯盟 `.256` 兩張圖
 * 整季都是紅的——一個大聯盟打 .256 的球員全紅，會被誤讀成「狀況很差」。
 * 方向資訊改由卡片下方的「數字越高／越低越好」小字承擔（用語同
 * `components/glossary/bands-table.tsx` 的尺標），線本身只負責畫形狀。
 */
function Sparkline({ points }: { points: Point[] }) {
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

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-5 h-32 w-full text-accent"
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
  /** 只用來寫下方那行「數字越高／越低越好」——不再影響線色，見 `Sparkline`。 */
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
      <Sparkline points={series.points} />
      <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        數字越{higherIsBetter ? "高" : "低"}越好
      </p>
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
