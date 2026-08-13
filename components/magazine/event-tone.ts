// Type-only import: erased at compile time, so nothing from `lib/services`
// (and therefore nothing from `lib/db/client.ts` → `pg`) reaches the browser
// bundle. See ticket 02 — a value import here breaks `next build`.
import type { Timeline } from "@/lib/services";

/** The `transaction_type` enum union, sourced from the service contract. */
type TransactionType = Timeline[number]["type"];

type Tone = "up" | "down" | "neutral";

/**
 * Transaction type → semantic tone shared by timeline and homepage feeds.
 *
 * Deliberately an exhaustive `Record` over the enum union: adding a
 * `transaction_type` value without classifying it here fails `pnpm typecheck`
 * instead of silently rendering neutral.
 */
export const EVENT_TONE: Record<TransactionType, Tone> = {
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

export function eventTone(type: TransactionType): Tone {
  return EVENT_TONE[type];
}
