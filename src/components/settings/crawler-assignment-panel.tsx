"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, UserRound } from "lucide-react";

import {
  setPlayerCrawlerAction,
  type SettingsActionState,
} from "@/app/(dm)/campaigns/[id]/settings/actions";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";

// DM-only crawler assignment (M7). Lists the campaign's PLAYER memberships and
// lets the DM link each to a CRAWLER entity they control (or unlink). This is
// the DM half of the player↔crawler link; the player reads their own sheet at
// /play/campaigns/[id]/sheet. Inviting users + managing roles stays M9.

export type PlayerMembershipView = {
  membershipId: string;
  userName: string | null;
  userEmail: string | null;
  crawler: { id: string; name: string } | null;
};

export type AssignableCrawler = { id: string; name: string; status: string };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function PlayerRow({
  campaignId,
  player,
  crawlers,
}: {
  campaignId: string;
  player: PlayerMembershipView;
  crawlers: AssignableCrawler[];
}) {
  const [state, formAction] = useActionState<SettingsActionState, FormData>(
    setPlayerCrawlerAction.bind(null, campaignId),
    undefined,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] px-[18px] py-[14px] first:border-t-0"
    >
      <input type="hidden" name="membershipId" value={player.membershipId} />
      <div className="flex min-w-[160px] items-center gap-[10px]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-3)] text-[var(--ink-faint)]">
          <UserRound aria-hidden size={15} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[var(--ink)]">
            {player.userName ?? player.userEmail ?? "Player"}
          </div>
          {player.userName && player.userEmail ? (
            <div className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
              {player.userEmail}
            </div>
          ) : null}
        </div>
      </div>

      <label className="sr-only" htmlFor={`crawler-${player.membershipId}`}>
        Crawler for {player.userName ?? player.userEmail ?? "player"}
      </label>
      <select
        id={`crawler-${player.membershipId}`}
        name="crawlerEntityId"
        defaultValue={player.crawler?.id ?? ""}
        className="h-9 flex-1 min-w-[180px] border border-[var(--line-strong)] bg-[var(--bg)] px-[10px] text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      >
        <option value="">— No crawler —</option>
        {crawlers.map((crawler) => (
          <option key={crawler.id} value={crawler.id}>
            {crawler.name}
            {crawler.status !== "CANON" ? ` (${crawler.status.toLowerCase()})` : ""}
          </option>
        ))}
      </select>

      <SaveButton />

      {state?.error ? (
        <p className="w-full text-[11.5px] text-[var(--hot)]">{state.error}</p>
      ) : state?.success ? (
        <p className="inline-flex w-full items-center gap-[6px] text-[11.5px] text-[var(--ok)]">
          <Check aria-hidden size={13} />
          {state.success}
        </p>
      ) : null}
    </form>
  );
}

export function CrawlerAssignmentPanel({
  campaignId,
  players,
  crawlers,
}: {
  campaignId: string;
  players: PlayerMembershipView[];
  crawlers: AssignableCrawler[];
}) {
  return (
    <Panel>
      <PanelHeader
        kicker="Crawlers"
        title="Player crawlers"
        sub="Link each player to the crawler they control. Their crawler sheet is projected to them read-only; you keep editing the entity through the review pipeline. Inviting users & managing roles arrives in M9."
      />
      {players.length === 0 ? (
        <p className="px-[18px] py-5 text-[12.5px] text-[var(--ink-faint)]">
          No players have joined this campaign yet. Player invites arrive in M9.
        </p>
      ) : crawlers.length === 0 ? (
        <p className="px-[18px] py-5 text-[12.5px] text-[var(--ink-faint)]">
          No crawlers exist yet. Create a CRAWLER in the World Browser first, then
          link it to a player here.
        </p>
      ) : (
        <div>
          {players.map((player) => (
            <PlayerRow
              key={player.membershipId}
              campaignId={campaignId}
              player={player}
              crawlers={crawlers}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
