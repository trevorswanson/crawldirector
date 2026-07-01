import { Coins, Heart, Skull, Sparkles, Swords, Layers } from "lucide-react";

import type { CrawlerSheet } from "@/server/services/crawlers";
import { cn } from "@/lib/utils";

// The player's own crawler sheet (M7). Renders only the fields the data model
// actually carries — HP/MP/gold/floor/level/kills/status and the (currently
// write-path-less) stat block, shown only when populated so the sheet never
// displays filler. Loot boxes, titles/achievements, and bio-edit suggestions
// are later M7 slices and deliberately absent here.
function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Coins;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-[10px] bg-[var(--bg-2)] px-[12px] py-[10px]">
      <Icon
        aria-hidden
        size={16}
        className={cn(accent ? "text-[var(--accent)]" : "text-[var(--ink-faint)]")}
      />
      <div className="min-w-0">
        <div className="font-mono text-[9.5px] uppercase tracking-[.1em] text-[var(--ink-faint)]">
          {label}
        </div>
        <div
          className={cn(
            "font-display text-[17px] font-bold leading-tight",
            accent && "text-[var(--accent)]",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export function CrawlerSheetPanel({ sheet }: { sheet: CrawlerSheet }) {
  const initial = (sheet.name.trim()[0] ?? "?").toUpperCase();
  const statEntries = Object.entries(sheet.stats);

  return (
    <div className="panel bracket max-w-[420px] p-[22px]">
      {/* identity */}
      <div className="mb-[18px] flex items-center gap-[14px]">
        {sheet.imageUrl ? (
          // Plain <img>: external URL, no next/image server proxy (matches the
          // DM entity header).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sheet.imageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full border border-[var(--accent)] object-cover"
          />
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center border border-[var(--accent)] bg-[var(--bg-3)] font-display text-[30px] font-bold text-[var(--accent)]">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div className="font-display text-[22px] font-bold leading-[1.1]">
            {sheet.name}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">
            {sheet.crawlerNo ? `${sheet.crawlerNo} · ` : ""}LVL {sheet.level}
          </div>
          {sheet.realName ? (
            <div className="mt-[3px] text-[12px] text-[var(--ink-dim)]">
              {sheet.realName}
            </div>
          ) : null}
        </div>
        {!sheet.isAlive ? (
          <span className="hud-tag ml-auto self-start text-[var(--hot)]">
            <Skull aria-hidden size={12} />
            Fallen
          </span>
        ) : null}
      </div>

      {/* vitals */}
      <div className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)]">
        <StatTile label="HP" value={sheet.hp == null ? "—" : String(sheet.hp)} icon={Heart} />
        <StatTile label="MP" value={sheet.mp == null ? "—" : String(sheet.mp)} icon={Sparkles} />
        <StatTile label="Gold" value={sheet.gold.toLocaleString()} icon={Coins} accent />
        <StatTile
          label="Floor"
          value={sheet.currentFloor == null ? "—" : String(sheet.currentFloor)}
          icon={Layers}
        />
      </div>

      {/* stat block — only when the crawler actually has stats */}
      {statEntries.length > 0 ? (
        <div className="mt-[16px] grid grid-cols-3 gap-px border border-[var(--line)] bg-[var(--line)]">
          {statEntries.map(([key, value]) => (
            <div key={key} className="bg-[var(--bg-2)] px-2 py-[10px] text-center">
              <div className="font-mono text-[9.5px] uppercase tracking-[.1em] text-[var(--ink-faint)]">
                {key}
              </div>
              <div
                className={cn(
                  "font-display text-[20px] font-bold",
                  value >= 70 && "text-[var(--accent)]",
                )}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* fame + kills */}
      <div className="mt-[16px] flex items-center justify-between border-t border-[var(--line)] pt-[12px] font-mono text-[11px] text-[var(--ink-dim)]">
        <span className="inline-flex items-center gap-[6px]">
          <Swords aria-hidden size={13} className="text-[var(--ink-faint)]" />
          {sheet.killCount.toLocaleString()} kills
        </span>
        <span className="text-[var(--ink-faint)]">
          {sheet.followerCount.toLocaleString()} watching
        </span>
      </div>

      {sheet.summary ? (
        <p className="mt-[14px] text-[12.5px] leading-[1.55] text-[var(--ink-dim)]">
          {sheet.summary}
        </p>
      ) : null}
    </div>
  );
}
