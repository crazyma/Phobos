import type { ReactNode } from "react";

/** 雜誌版面共用的 kicker + 襯線區塊標題。 */
export function SectionTitle({
  kicker,
  children,
  as: Heading = "h2",
  className,
}: {
  kicker: string;
  children: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-accent">
        {kicker}
      </p>
      <Heading className="font-serif text-4xl font-black leading-[0.95] tracking-tight text-foreground md:text-5xl">
        {children}
      </Heading>
    </div>
  );
}
