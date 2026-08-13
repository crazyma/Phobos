"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/players", label: "球員名冊" },
  { href: "/glossary", label: "名詞" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // 寬度容器一定要放在 `<header>` **內層**（比照 `site-footer.tsx`）。
  // `<header>` 是 body（`flex min-h-dvh flex-col`）的直接子元素，若把
  // `mx-auto` 掛在它身上，`margin-inline: auto` 會取消 flex 預設的
  // `align-items: stretch`，整個 header 就縮成內容寬度並置中——`border-b-4`
  // 的分隔線也跟著只有文字那麼寬。外層不設寬度即可維持滿版拉伸。
  return (
    <header>
      <div className="mx-auto max-w-6xl px-6 pt-6 sm:pt-10">
        <div className="flex items-center justify-between border-b-4 border-primary pb-3">
          <Link
            href="/"
            className="font-serif text-sm font-black uppercase tracking-[0.3em] text-primary"
            onClick={() => setOpen(false)}
          >
            Phobos
          </Link>

          {/* desktop nav */}
          <nav className="hidden items-center gap-5 sm:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "font-serif text-sm font-bold transition-colors hover:text-foreground",
                  isActive(item.href) ? "text-accent" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* mobile toggle */}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground sm:hidden"
            aria-label="切換選單"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* mobile collapsible nav — 與上面那列共用同一個寬度容器，才會左右對齊 */}
        {open && (
          <nav className="flex flex-col border-b border-border sm:hidden">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "px-1 py-3 font-serif text-sm font-bold transition-colors hover:bg-muted",
                  isActive(item.href) ? "text-accent" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
