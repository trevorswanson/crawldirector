import { notFound } from "next/navigation";

import { Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { getSession } from "@/server/services/sessions";
import { listEntitiesForUser } from "@/server/services/entities";
import { listPlayerMemberships } from "@/server/services/crawlers";
import { listSessionReveals } from "@/server/services/knowledge";
import {
  addSessionLogEntryAction,
  generateSessionRecapAction,
  publishSessionRecapAction,
} from "@/app/(dm)/actions";
import { ConsoleScreen, ScreenHeader } from "@/components/console/screen";
import { SessionLogComposer } from "@/components/sessions/session-log-composer";
import { SessionLogList } from "@/components/sessions/session-log-list";
import { SessionRecapPanel } from "@/components/sessions/session-recap-panel";
import { SessionRevealPanel } from "@/components/sessions/session-reveal-panel";

// playedAt is a bare calendar date (parsed as UTC midnight from a date-only
// `<input type="date">`), so it renders in UTC too — see session-list.tsx.
function formatPlayedAt(playedAt: Date | null) {
  return playedAt
    ? playedAt.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Undated";
}

export default async function CampaignSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);
  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== Role.OWNER && role !== Role.CO_DM) notFound();

  const [session, candidateList, players, reveals] = await Promise.all([
    getSession(user.id, id, sessionId),
    listEntitiesForUser(user.id, id),
    listPlayerMemberships(user.id, id),
    listSessionReveals(user.id, id, sessionId),
  ]);
  if (!session) notFound();

  const candidates = candidateList.entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
  }));

  return (
    <ConsoleScreen>
      <ScreenHeader kicker={campaign.name} title={session.title} />
      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="max-w-[760px]">
          <p className="mb-1 font-mono text-[10.5px] text-[var(--ink-faint)]">
            {formatPlayedAt(session.playedAt)}
            {session.focus ? ` · ${session.focus}` : ""}
          </p>
          {session.notes && (
            <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
              {session.notes}
            </p>
          )}

          <div className="mb-7 border border-[var(--line)] bg-[var(--bg-1)] px-[16px] py-[14px]">
            <SessionLogComposer
              campaignId={id}
              action={addSessionLogEntryAction.bind(null, id, sessionId)}
              candidates={candidates}
            />
          </div>

          <SessionLogList campaignId={id} sessionId={sessionId} entries={session.entries} />

          <div className="mt-8 border-t border-[var(--line)] pt-7">
            <SessionRecapPanel
              action={generateSessionRecapAction.bind(null, id, sessionId)}
              publishAction={publishSessionRecapAction.bind(null, id, sessionId)}
              campaignId={id}
              defaultPublishTitle={`Previously on Dungeon Crawler World: ${session.title}`}
            />
          </div>

          <div className="mt-8 border-t border-[var(--line)] pt-7">
            <SessionRevealPanel
              campaignId={id}
              sessionId={sessionId}
              candidates={candidates}
              players={players}
              reveals={reveals}
            />
          </div>
        </div>
      </div>
    </ConsoleScreen>
  );
}
