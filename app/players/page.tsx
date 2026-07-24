import { getPlayerSummaries } from "@/lib/services";
import { PlayersView } from "@/components/players/players-view";

// ISR: 名冊變動不頻繁，30 分鐘再驗證即可（spec-02 §5）。ETL 完成後改 on-demand
// revalidate 為 v2 open item。
export const revalidate = 1800;

export default async function PlayersPage() {
  const all = await getPlayerSummaries();
  const tracked = all.filter((p) => p.lifecycle === "tracked");
  const archived = all.filter((p) => p.lifecycle === "archived");

  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-bold">球員名冊</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        追蹤中的台灣球員（共 {tracked.length} 位）。
      </p>
      <div className="mt-6">
        <PlayersView tracked={tracked} archived={archived} />
      </div>
    </section>
  );
}
