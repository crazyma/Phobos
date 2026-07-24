import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Phobos — 台灣球員大聯盟",
  description: "記錄台灣球員在大聯盟（及 3A/2A）的表現與動態。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
