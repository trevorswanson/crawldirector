import type { Job } from "@/generated/prisma/client";
import { JobKind } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import { embedSearchDocs } from "@/server/services/embeddings";
import { fleshOutEntities } from "@/server/services/generation";
import { seedCampaignFromLore } from "@/server/services/seeding";

// Job handler registry (M4 — docs/04-ai-integration.md §"Async / batching").
// Each handler receives the full Job row and returns a JSON-serialisable result.
// Payloads were validated at enqueue time; handlers re-validate shape cheaply
// and throw ServiceError (safe text only) on anything unexpected.
//
// Adding a new job kind: add a JobKind enum value to the schema, add one entry
// here, and enqueue with that kind — no other changes needed.

export const jobHandlers: Record<JobKind, (job: Job) => Promise<unknown>> = {
  [JobKind.BULK_FLESH]: async (job: Job) => {
    const payload = job.payload as { entityIds?: unknown };
    if (
      !Array.isArray(payload.entityIds) ||
      !payload.entityIds.every((v) => typeof v === "string")
    ) {
      throw new ServiceError("Invalid job payload.");
    }
    // fleshOutEntities re-checks DM membership with job.createdById, so a member
    // who lost the role between enqueue and execution fails safely.
    return fleshOutEntities(job.createdById, job.campaignId, payload.entityIds);
  },
  [JobKind.LORE_SEED]: async (job: Job) => {
    // Payload is empty by design — dataset path and visibility policy are fixed
    // server-side; nothing user-controlled flows in (clearExisting is deliberately
    // not reachable from here).
    return seedCampaignFromLore(job.createdById, job.campaignId);
  },
  [JobKind.EMBED_SEARCH_DOCS]: async (job: Job) => {
    // Empty payload by design — embedSearchDocs re-checks DM membership with
    // job.createdById and resolves the embedder server-side. `force` is not
    // reachable from here (a routine backfill only embeds missing/stale docs).
    return embedSearchDocs(job.createdById, job.campaignId);
  },
};
