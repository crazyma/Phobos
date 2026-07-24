import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Phobos</h1>
      <p className="mt-2 text-muted-foreground">
        台灣球員大聯盟網站 — 前端骨架已就位。
      </p>
      <div className="mt-6">
        <Button>shadcn/ui 就緒</Button>
      </div>
    </main>
  );
}
