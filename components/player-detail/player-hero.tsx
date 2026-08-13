import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { PlayerDetail } from "@/lib/services";
import { batsThrowsLabel } from "@/lib/services/player-status";
import { teamLogo } from "@/lib/services/team-map";
import { LevelBadge } from "@/components/magazine/level-badge";

/** Birthdate "YYYY-MM-DD" → "YYYY-MM-DD（xx 歲）", or the date alone if unparseable. */
function birthLabel(birthdate: string | null): string | null {
  if (!birthdate) return null;
  // Parse the Y/M/D components directly — `new Date("YYYY-MM-DD")` is UTC
  // midnight, which off-by-ones the age around the birthday on non-UTC servers.
  const parts = birthdate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return birthdate;
  const [by, bm, bd] = parts;
  const now = new Date();
  let age = now.getFullYear() - by;
  const m = now.getMonth() + 1 - bm;
  if (m < 0 || (m === 0 && now.getDate() < bd)) age--;
  return `${birthdate}（${age} 歲）`;
}

/**
 * Zone 1 (spec-02 §2.3): bio, the status one-liner, and the recent-form
 * sentence. Presentational (no "use client") — the server page passes data in.
 */
export function PlayerHero({ player }: { player: PlayerDetail }) {
  const displayName = player.nameZh ?? player.nameEn;
  const hand = batsThrowsLabel(player.bats, player.throws);
  const born = birthLabel(player.birthdate);

  const logo = teamLogo(player.team?.id);
  const facts = [
    { label: "守備位置", value: player.primaryPosition ?? "—" },
    { label: "所屬球隊", value: player.team?.name ?? "—" },
    { label: "年齡", value: born ?? "—" },
    { label: "投打", value: hand ?? "—" },
  ];
  const surname = displayName.slice(0, 1);

  return (
    <header>
      <Link
        href="/players"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-accent"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        返回球員名冊
      </Link>

      <section className="relative overflow-hidden rounded-2xl bg-primary p-6 sm:p-8">
        <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-10 select-none font-serif text-[12rem] font-black leading-none text-primary-foreground/[0.06]">
          {surname}
        </span>
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          {logo && (
            <div className="flex size-28 shrink-0 items-center justify-center rounded-full bg-primary ring-4 ring-accent sm:size-36">
              <img src={logo} alt="" className="size-20 object-contain sm:size-24" />
            </div>
          )}
          <div className="min-w-0">
            {player.team && <LevelBadge level={player.team.level} />}
            <h1 className="mt-3 font-serif text-5xl font-black leading-[0.95] tracking-tight text-primary-foreground sm:text-6xl">
              {displayName}
            </h1>
            <p className="mt-2 font-mono text-sm uppercase tracking-[0.2em] text-primary-foreground/70">
              {player.nameEn}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-8 min-w-0 grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-start">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-accent">球員檔案</p>
          <p className="mt-4 max-w-prose border-l-4 border-accent pl-4 font-serif text-lg italic leading-relaxed text-foreground">
            {player.statusSentence}
          </p>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {player.recentForm ?? "近況同步中"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t-2 border-foreground pt-5 sm:grid-cols-4 md:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 break-all font-serif text-lg font-black text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}
