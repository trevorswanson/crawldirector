import {
  Backpack,
  Crown,
  Package,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import type {
  CrawlerLoadout,
  CrawlerLoadoutEntity,
  CrawlerLootBox,
} from "@/server/services/crawlers";
import { entityTypeColor } from "@/lib/entities";

// The player's own crawler loadout (M7): inventory, loot boxes, achievements,
// and titles read through the own-crawler link (invariant #5). Each section
// renders only when it has real entries — no filler (AGENTS.md) — and an empty
// loadout shows a single honest note.

function EntityRow({ entity }: { entity: CrawlerLoadoutEntity }) {
  return (
    <div className="flex items-baseline gap-[8px] px-[12px] py-[9px]">
      <span
        aria-hidden
        className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ backgroundColor: entityTypeColor(entity.type) }}
      />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-[var(--ink)]">
          {entity.name}
        </div>
        {entity.summary ? (
          <div className="truncate text-[11.5px] text-[var(--ink-dim)]">
            {entity.summary}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  label,
  icon: Icon,
  count,
  children,
}: {
  label: string;
  icon: LucideIcon;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-[8px] flex items-center gap-[8px]">
        <Icon aria-hidden size={15} className="text-[var(--ink-faint)]" />
        <h3 className="font-mono text-[10px] uppercase tracking-[.12em] text-[var(--ink-dim)]">
          {label}
        </h3>
        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
          {count}
        </span>
      </div>
      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--bg-2)]">
        {children}
      </div>
    </section>
  );
}

function LootBoxRow({ box }: { box: CrawlerLootBox }) {
  return (
    <div className="px-[12px] py-[9px]">
      <div className="flex items-baseline gap-[8px]">
        <span
          aria-hidden
          className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ backgroundColor: entityTypeColor(box.type) }}
        />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[var(--ink)]">
            {box.name}
          </div>
          {box.fromAchievement ? (
            <div className="truncate font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
              from {box.fromAchievement}
            </div>
          ) : null}
        </div>
      </div>
      {box.contents.length > 0 ? (
        <ul className="mt-[6px] ml-[15px] border-l border-[var(--line)] pl-[10px]">
          {box.contents.map((item) => (
            <li
              key={item.entityId}
              className="truncate py-[2px] text-[11.5px] text-[var(--ink-dim)]"
            >
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CrawlerLoadoutPanel({ loadout }: { loadout: CrawlerLoadout }) {
  const { items, lootBoxes, achievements, titles } = loadout;
  const isEmpty =
    items.length === 0 &&
    lootBoxes.length === 0 &&
    achievements.length === 0 &&
    titles.length === 0;

  if (isEmpty) {
    return (
      <div className="flex-1 self-stretch">
        <p className="px-[2px] py-[10px] text-[12px] text-[var(--ink-faint)]">
          No inventory, loot boxes, achievements, or titles recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-[20px]">
      {items.length > 0 ? (
        <Section label="Inventory" icon={Backpack} count={items.length}>
          {items.map((item) => (
            <EntityRow key={item.entityId} entity={item} />
          ))}
        </Section>
      ) : null}

      {lootBoxes.length > 0 ? (
        <Section label="Loot Boxes" icon={Package} count={lootBoxes.length}>
          {lootBoxes.map((box) => (
            <LootBoxRow key={box.entityId} box={box} />
          ))}
        </Section>
      ) : null}

      {achievements.length > 0 ? (
        <Section label="Achievements" icon={Trophy} count={achievements.length}>
          {achievements.map((a) => (
            <EntityRow key={a.entityId} entity={a} />
          ))}
        </Section>
      ) : null}

      {titles.length > 0 ? (
        <Section label="Titles" icon={Crown} count={titles.length}>
          {titles.map((t) => (
            <EntityRow key={t.entityId} entity={t} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}
