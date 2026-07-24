"use client";

import { useMemo, useState } from "react";
import type { PlayerSummary } from "@/lib/services";
import { levelLabel, type TeamLevel } from "@/lib/services/player-status";
import { PlayerCard } from "./player-card";

type SortKey = "name" | "level";

/** 由高到低的層級顯示序（無隊者排最後）。 */
const LEVEL_ORDER: TeamLevel[] = ["mlb", "aaa", "aa", "a_plus", "a", "rookie"];

function displayName(p: PlayerSummary): string {
  return p.nameZh ?? p.nameEn;
}

function levelRank(p: PlayerSummary): number {
  return p.team ? LEVEL_ORDER.indexOf(p.team.level) : LEVEL_ORDER.length;
}

/**
 * 名冊呈現層（client）：追蹤中球員的層級篩選 + 排序，外加 archived 折疊區。
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
  const [sort, setSort] = useState<SortKey>("name");

  const availableLevels = useMemo(() => {
    const present = new Set<TeamLevel>();
    for (const p of tracked) if (p.team) present.add(p.team.level);
    return LEVEL_ORDER.filter((l) => present.has(l));
  }, [tracked]);

  const shown = useMemo(() => {
    const filtered =
      level === "all" ? tracked : tracked.filter((p) => p.team?.level === level);
    return [...filtered].sort((a, b) => {
      if (sort === "level") {
        const diff = levelRank(a) - levelRank(b);
        if (diff !== 0) return diff;
      }
      return displayName(a).localeCompare(displayName(b), "zh-Hant");
    });
  }, [tracked, level, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1">
          層級
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as "all" | TeamLevel)}
            className="rounded border border-border bg-background px-2 py-1"
          >
            <option value="all">全部</option>
            {availableLevels.map((l) => (
              <option key={l} value={l}>
                {levelLabel(l)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          排序
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-border bg-background px-2 py-1"
          >
            <option value="name">依姓名</option>
            <option value="level">依層級</option>
          </select>
        </label>
      </div>

      {shown.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <li key={p.playerId}>
              <PlayerCard player={p} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">目前沒有符合條件的球員。</p>
      )}

      {archived.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium">
            歷史球員（{archived.length}）
          </summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {archived.map((p) => (
              <li key={p.playerId}>
                <PlayerCard player={p} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
