import type { affiliation, health, teamLevel } from "@/lib/db/schema/enums";

export type Affiliation = (typeof affiliation.enumValues)[number];
export type Health = (typeof health.enumValues)[number];
export type TeamLevel = (typeof teamLevel.enumValues)[number];

const LEVEL_LABELS: Record<TeamLevel, string> = {
  mlb: "大聯盟",
  aaa: "3A",
  aa: "2A",
  a_plus: "高階1A",
  a: "1A",
  rookie: "新人聯盟",
};

/** Team level → zh display, or null when the level is unknown. */
export function levelLabel(level: TeamLevel | null | undefined): string | null {
  if (!level) return null;
  return LEVEL_LABELS[level];
}

/** `il_60` / `il_15` → `IL-60` / `IL-15`; missing detail → plain `IL`. */
function ilLabel(ilDetail: string | null | undefined): string {
  const digits = ilDetail?.match(/(\d+)/)?.[1];
  return digits ? `IL-${digits}` : "IL";
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sign: "簽約",
  call_up: "升上大聯盟",
  send_down: "下放小聯盟",
  trade: "交易",
  waiver_claim: "讓渡挑選",
  dfa: "指定讓渡",
  release: "釋出",
  declare_fa: "宣告自由球員",
  assign: "指派",
  il_on: "進入傷兵名單",
  il_off: "傷兵名單回歸",
  activate: "登錄",
  depart: "離開美職",
  other: "異動",
};

/** transaction_events.type → zh badge label (spec-02 §2.3 timeline). */
export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? "異動";
}

const HAND_LABELS: Record<string, string> = { L: "左", R: "右", S: "左右" };

/**
 * Bats/throws → "右打・左投" (spec-02 §2.3 bio). Either side may be missing;
 * returns null when both are absent.
 */
export function batsThrowsLabel(
  bats: string | null | undefined,
  throws: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (bats && HAND_LABELS[bats]) parts.push(`${HAND_LABELS[bats]}打`);
  if (throws && HAND_LABELS[throws]) parts.push(`${HAND_LABELS[throws]}投`);
  return parts.length ? parts.join("・") : null;
}

export type StatusInput = {
  affiliation: Affiliation | null | undefined;
  health: Health | null | undefined;
  ilDetail: string | null | undefined;
  level: TeamLevel | null | undefined;
};

/**
 * Compose the one-line status「歸屬 × 健康」(spec-01 B.2, spec-02 §2.2).
 * e.g. rostered+il at AAA on the 60-day → "3A・傷兵名單（IL-60）".
 * When no status has been projected yet (empty state) returns「狀態同步中」so
 * the roster still renders instead of crashing on a missing row.
 */
export function buildStatusSentence(input: StatusInput): string {
  const { affiliation, health, ilDetail, level } = input;

  if (!affiliation) return "狀態同步中";

  const withHealth = (base: string) =>
    health === "il" ? `${base}・傷兵名單（${ilLabel(ilDetail)}）` : base;

  switch (affiliation) {
    case "rostered":
      return withHealth(levelLabel(level) ?? "現役");
    case "dfa":
      return withHealth("指定讓渡（DFA）");
    case "free_agent":
      return "自由球員";
    case "released":
      return "已遭釋出";
    case "departed":
      return "已離開美職";
  }
}
