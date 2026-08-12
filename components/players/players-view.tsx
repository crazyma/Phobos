"use client";

import { useMemo, useState } from "react";
import type { PlayerSummary } from "@/lib/services";
import { levelLabel, type TeamLevel } from "@/lib/services/player-status";
import { EmptyState } from "@/components/magazine/empty-state";
import { LevelBadge } from "@/components/magazine/level-badge";
import { TagButton } from "@/components/magazine/tag-button";
import { PlayerCard } from "./player-card";

/** 由高到低的層級顯示序（無隊者排最後）。 */
const LEVEL_ORDER: TeamLevel[] = ["mlb", "aaa", "aa", "a_plus", "a", "rookie"];

const LEVEL_COPY: Record<TeamLevel, { note: string; en: string }> = {
  mlb: { note: "大聯盟現役", en: "Major League" },
  aaa: { note: "3A 一階之遙", en: "Triple-A" },
  aa: { note: "2A 養成階段", en: "Double-A" },
  a_plus: { note: "高階 1A 養成", en: "High-A" },
  a: { note: "1A 養成階段", en: "Single-A" },
  rookie: { note: "新人聯盟養成", en: "Rookie League" },
};

function displayName(p: PlayerSummary): string {
  return p.nameZh ?? p.nameEn;
}

/**
 * 名冊呈現層（client）：追蹤中球員的層級篩選，外加 archived 折疊區。
 * 名冊本身依 LEVEL_ORDER 分區渲染、區內固定依姓名排序，故不再提供排序控制項。
 * 資料量小，篩選/排序全在 client（spec-02）。
 */
export function PlayersView({
  tracked,
  archived,
}: {
  tracked: PlayerSummary[];
  archived: PlayerSummary[];
}) {
  const [level, setLevel] = useState<"all" | TeamLevel>("all");

  const availableLevels = useMemo(() => {
    const present = new Set<TeamLevel>();
    for (const p of tracked) if (p.team) present.add(p.team.level);
    return LEVEL_ORDER.filter((l) => present.has(l));
  }, [tracked]);

  const shown = useMemo(() => {
    const filtered =
      level === "all" ? tracked : tracked.filter((p) => p.team?.level === level);
    return [...filtered].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), "zh-Hant"),
    );
  }, [tracked, level]);

  return (
    <div>
      <div className="mb-12 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          層級
        </span>
        <TagButton label="全部" active={level === "all"} onClick={() => setLevel("all")} />
        {availableLevels.map((l) => (
          <TagButton
            key={l}
            label={levelLabel(l) ?? l}
            active={level === l}
            onClick={() => setLevel(l)}
          />
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="space-y-16">
          {LEVEL_ORDER.map((currentLevel) => {
            const group = shown.filter((p) => p.team?.level === currentLevel);
            if (group.length === 0) return null;
            const copy = LEVEL_COPY[currentLevel];
            return (
              <section key={currentLevel}>
                <div className="mb-6 flex items-end justify-between border-b-2 border-border pb-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <LevelBadge level={currentLevel} />
                    <h2 className="font-serif text-2xl font-black text-foreground">{copy.note}</h2>
                    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      {copy.en}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{group.length} 位</span>
                </div>
                <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {group.map((p, index) => (
                    <li key={p.playerId}>
                      <PlayerCard player={p} index={index} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {level === "all" && shown.some((p) => !p.team) && (
            <section>
              <div className="mb-6 flex items-end justify-between border-b-2 border-border pb-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                  <span className="rounded border border-border px-2 py-1 font-mono text-xs font-bold leading-none text-muted-foreground">
                    待確認
                  </span>
                  <h2 className="font-serif text-2xl font-black text-foreground">層級待確認</h2>
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    Team assignment pending
                  </span>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {shown.filter((p) => !p.team).length} 位
                </span>
              </div>
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {shown
                  .filter((p) => !p.team)
                  .map((p, index) => (
                    <li key={p.playerId}>
                      <PlayerCard player={p} index={index} />
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          title="目前沒有符合條件的球員"
          description="調整篩選條件後再試試看。"
        />
      )}

      {archived.length > 0 && (
        <details className="mt-16">
          <summary className="flex cursor-pointer list-none items-end justify-between border-b-2 border-border pb-3 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className="rounded border border-border px-2 py-1 font-mono text-xs font-bold leading-none text-muted-foreground">
                ARCHIVED
              </span>
              <span className="font-serif text-2xl font-black text-foreground">歷史球員</span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">{archived.length} 位</span>
          </summary>
          {/* 封存外觀由 PlayerCard 自己決定；這裡只表達語意，不覆寫它的樣式。 */}
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((p, index) => (
              <li key={p.playerId}>
                <PlayerCard player={p} index={index} archived />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
