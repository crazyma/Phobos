import { formatDateTimeTaipei } from "@/lib/format";

/**
 * Global footer. Shows the data-freshness stamp「資料更新於 {台灣時間}」.
 * `lastSyncedAt` comes from the latest completed (non-failed) `sync_runs` row
 * via `getLastSyncedAt` (wired in the root layout); it is null before the ETL
 * has ever finished a run, and then renders a placeholder dash.
 */
export function SiteFooter({
  lastSyncedAt = null,
}: {
  lastSyncedAt?: Date | string | null;
}) {
  // `mt-auto` keeps the footer pinned to the bottom of the `flex min-h-dvh
  // flex-col` body on short pages. Do not add spacing here via `mt-*`: it would
  // collide with `mt-auto` on the same `margin-top` declaration at equal
  // specificity, so whichever rule lands later in the compiled sheet silently
  // wins and the other is dropped without warning. If breathing room is ever
  // wanted between the page content and this divider, put it on `<main>` or on
  // the page's own section instead of on the footer's margin-top.
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-5 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        資料更新於 {formatDateTimeTaipei(lastSyncedAt)}（台灣時間）
      </div>
    </footer>
  );
}
