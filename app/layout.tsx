import type { Metadata } from "next";
import "./globals.css";
import { Geist_Mono, Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getLastSyncedAt } from "@/lib/services";
import { getSiteUrl } from "@/lib/site";
import { siteOpenGraph, siteTwitter } from "@/lib/seo/open-graph";

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans-tc",
});

const notoSerifTC = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-noto-serif-tc",
});

const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "Phobos — 台灣球員大聯盟",
  description: "記錄台灣球員在大聯盟（及 3A/2A）的表現與動態。",
  openGraph: siteOpenGraph,
  twitter: siteTwitter,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Freshness stamp comes from the latest completed ETL run (spec-03 §7).
  const lastSyncedAt = await getLastSyncedAt();

  return (
    <html
      lang="zh-Hant"
      className={cn("font-sans", notoSansTC.variable, notoSerifTC.variable, geistMono.variable)}
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter lastSyncedAt={lastSyncedAt} />
      </body>
    </html>
  );
}
