import { levelLabel, type TeamLevel } from "@/lib/services/player-status";
import { cn } from "@/lib/utils";

const LEVEL_CLASS: Record<TeamLevel, string> = {
  mlb: "bg-mlb text-mlb-foreground",
  aaa: "bg-aaa text-aaa-foreground",
  aa: "bg-aa text-aa-foreground",
  a_plus: "bg-a-plus text-a-plus-foreground",
  a: "bg-a text-a-foreground",
  rookie: "bg-rookie text-rookie-foreground",
};

/** 六階球隊層級的共用徽章；中文顯示一律取既有 levelLabel()。 */
export function LevelBadge({ level, className }: { level: TeamLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-1 font-mono text-xs font-bold leading-none",
        LEVEL_CLASS[level],
        className,
      )}
    >
      {levelLabel(level)}
    </span>
  );
}
