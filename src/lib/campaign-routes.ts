import type { Role } from "@/generated/prisma/client";

// Single source of truth for the campaign landing path per viewer role: players
// land in the crawler interface (`/play/campaigns/[id]`), everyone else in the
// DM console (`/campaigns/[id]`). Used by the two console role gates and the
// dashboard so the /play-vs-/campaigns rule lives in one place.
export function campaignHomeHref(
  role: Role | null | undefined,
  campaignId: string,
): string {
  return role === "PLAYER"
    ? `/play/campaigns/${campaignId}`
    : `/campaigns/${campaignId}`;
}

// The parsing twin of the hrefs above: pull the campaign id out of a DM-console
// pathname (`/campaigns/[id]/...`), or null off-route. The route shape lives
// here so nav/switcher components don't each hardcode the regex.
export function campaignIdFromPathname(pathname: string): string | null {
  return pathname.match(/^\/campaigns\/([^/]+)/)?.[1] ?? null;
}
