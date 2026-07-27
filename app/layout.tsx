import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getLastSyncedAt } from "@/lib/services";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Phobos — 台灣球員大聯盟",
  description: "記錄台灣球員在大聯盟（及 3A/2A）的表現與動態。",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Freshness stamp comes from the latest completed ETL run (spec-03 §7).
  const lastSyncedAt = await getLastSyncedAt();

  return (
    <html lang="zh-Hant" className={cn("font-sans", geist.variable)}>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter lastSyncedAt={lastSyncedAt} />
      </body>
    </html>
  );
}
