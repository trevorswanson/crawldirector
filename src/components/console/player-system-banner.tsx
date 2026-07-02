import { Eye } from "lucide-react";

import { HudTag } from "@/components/ui/hud-tag";

// The in-fiction "THE SYSTEM" broadcast banner that opens every player crawler-
// interface screen (Known World, Crawler Sheet, and later feeds). One shared
// bar so the gradient / accent chrome / "player view" tag stay identical across
// player screens; each screen supplies only its own caption.
export function PlayerSystemBanner({ caption }: { caption: string }) {
  return (
    <div
      className="flex items-center gap-[14px] border-b border-[var(--line)] px-[26px] py-[14px]"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent)",
      }}
    >
      <span className="live-dot" />
      <span className="font-display text-[13px] font-bold tracking-[.18em] text-[var(--accent)]">
        THE SYSTEM
      </span>
      <span className="font-mono text-[11px] text-[var(--ink-faint)]">{caption}</span>
      <HudTag className="ml-auto">
        <Eye aria-hidden size={12} />
        player view
      </HudTag>
    </div>
  );
}
