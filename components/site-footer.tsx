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
  return (
    <footer className="mt-auto mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-5 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        資料更新於 {formatDateTimeTaipei(lastSyncedAt)}（台灣時間）
      </div>
    </footer>
  );
}
