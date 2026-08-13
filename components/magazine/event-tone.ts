/** Transaction type → semantic tone shared by timeline and homepage feeds. */
export const EVENT_TONE: Record<string, "up" | "down" | "neutral"> = {
  sign: "up",
  call_up: "up",
  il_off: "up",
  activate: "up",
  send_down: "down",
  dfa: "down",
  release: "down",
  declare_fa: "down",
  depart: "down",
  il_on: "down",
  trade: "neutral",
  waiver_claim: "neutral",
  assign: "neutral",
  other: "neutral",
};

export function eventTone(type: string): "up" | "down" | "neutral" {
  return EVENT_TONE[type] ?? "neutral";
}
