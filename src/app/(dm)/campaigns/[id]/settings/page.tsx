import { notFound } from "next/navigation";

import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import { listAiKeys } from "@/server/services/ai-keys";
import { AiKeysPanel } from "@/components/settings/ai-keys-panel";
import { Kicker } from "@/components/ui/kicker";

// Campaign settings. First section: BYO AI provider keys (M4). DM/co-DM only —
// players never reach this route (the World Browser is their surface), and the
// service double-checks the role.
export default async function CampaignSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);
  if (!campaign) notFound();

  const role = campaign.members[0]?.role;
  if (role !== "OWNER" && role !== "CO_DM") notFound();

  const configured = await listAiKeys(user.id, id);

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] px-6 py-7">
      <div className="mx-auto max-w-[760px]">
        <Kicker noLead className="mb-[10px]">
          {campaign.name} · Settings
        </Kicker>
        <h1 className="mb-1 font-display text-[22px] font-semibold tracking-[.01em] text-[var(--ink)]">
          Campaign settings
        </h1>
        <p className="mb-6 max-w-[560px] text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
          Configure how this crawl uses AI. Generation always produces reviewable
          proposals — never silent canon.
        </p>
        <AiKeysPanel campaignId={id} configured={configured} />
      </div>
    </div>
  );
}
