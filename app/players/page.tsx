import { getPlayerSummaries } from "@/lib/services";
import { SectionTitle } from "@/components/magazine/section-title";
import { PlayersView } from "@/components/players/players-view";

// ISR: 名冊變動不頻繁，30 分鐘再驗證即可（spec-02 §5）。ETL 完成後改 on-demand
// revalidate 為 v2 open item。
export const revalidate = 1800;

export default async function PlayersPage() {
  const all = await getPlayerSummaries();
  const tracked = all.filter((p) => p.lifecycle === "tracked");
  const archived = all.filter((p) => p.lifecycle === "archived");

  return (
    <section className="mx-auto max-w-6xl px-6 py-10 pb-16">
      <div className="grid gap-6 md:grid-cols-[1.5fr_1fr] md:items-end">
        <SectionTitle as="h1" kicker="ROSTER / PLAYERS">
          球員<span className="text-accent">名冊</span>
        </SectionTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          追蹤中的台灣旅美球員總覽，依所在層級分區呈現。共 {tracked.length} 位，點選任一位球員可查看完整檔案。
        </p>
      </div>
      <div className="mt-10">
        <PlayersView tracked={tracked} archived={archived} />
      </div>
    </section>
  );
}
