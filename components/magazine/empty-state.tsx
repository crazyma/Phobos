import { SearchX } from "lucide-react";

/** 搜尋與篩選結果為空時使用的共用空狀態。 */
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-secondary">
        <SearchX className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="font-serif text-lg font-black text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
