import { formatDateTimeTaipei } from "@/lib/format";

/**
 * Global footer. Shows the data-freshness stamp「資料更新於 {台灣時間}」.
 * `lastSyncedAt` will come from the latest successful `sync_runs` row once the
 * ETL slice lands; until then it is null and renders a placeholder dash.
 */
export function SiteFooter({
  lastSyncedAt = null,
}: {
  lastSyncedAt?: Date | string | null;
}) {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-muted-foreground">
        資料更新於 {formatDateTimeTaipei(lastSyncedAt)}（台灣時間）
      </div>
    </footer>
  );
}
