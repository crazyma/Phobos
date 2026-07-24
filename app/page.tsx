import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Phobos — 台灣球員大聯盟</h1>
      <p className="mt-3 text-muted-foreground">
        記錄台灣球員在大聯盟（及 3A/2A）的表現與動態，並介紹棒球規則與名詞。
      </p>
      <div className="mt-6">
        <Button render={<Link href="/players">看球員名冊</Link>} />
      </div>
    </section>
  );
}
