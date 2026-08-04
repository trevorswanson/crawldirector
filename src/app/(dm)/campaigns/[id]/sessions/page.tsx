import { notFound } from "next/navigation";

import { Role } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listSessions } from "@/server/services/sessions";
import { createSessionAction } from "@/app/(dm)/actions";
import { ConsoleScreen, ScreenHeader } from "@/components/console/screen";
import { CreateSessionForm } from "@/components/sessions/create-session-form";
import { SessionList } from "@/components/sessions/session-list";

export default async function CampaignSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);
  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== Role.OWNER && role !== Role.CO_DM) notFound();

  const sessions = await listSessions(user.id, id);

  return (
    <ConsoleScreen>
      <ScreenHeader kicker={campaign.name} title="Sessions" />
      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        <div className="max-w-[760px]">
          <p className="mb-5 max-w-2xl text-[13px] leading-[1.6] text-[var(--ink-dim)]">
            Capture what happens live at the table. Sessions and their log
            entries are scratch — they never touch canon until a later step
            promotes them.
          </p>
          <div className="mb-7 border border-[var(--line)] bg-[var(--bg-1)] px-[16px] py-[14px]">
            <CreateSessionForm action={createSessionAction.bind(null, id)} />
          </div>
          <SessionList campaignId={id} sessions={sessions} />
        </div>
      </div>
    </ConsoleScreen>
  );
}
