import { Prisma } from "@/generated/prisma/client";
import { ServiceError } from "@/lib/errors";
import {
  EMBED_MODEL_DEFAULT,
  describeProviderError,
  resolveCampaignEmbedder,
} from "@/server/ai";
import { prisma } from "@/server/db";
import { assertCampaignDm } from "@/server/services/ai-keys";
import { assertWithinSpendCap, recordAiUsage } from "@/server/services/ai-usage";

// Semantic embedding of the SearchDoc index (M5 slice 4a — docs/07-search-
// retrieval.md). The full-text index (slices 1–3) is kept fresh inside canon
// write transactions; embeddings are the *expensive* part, so they are built
// off the request path through the Job worker (handler: EMBED_SEARCH_DOCS) and
// written here via raw SQL — the `embedding` column is `Unsupported("vector")`,
// so the typed Prisma client can't set it. Embeddings are derived data: never
// provenance, never shown to players, regenerable from canon at any time.
//
// Embeddings need an OpenAI-compatible provider (the Anthropic API has none);
// `resolveCampaignEmbedder` returns null otherwise and the layer degrades to
// full-text search. SearchDoc content changes enqueue this job automatically;
// the explicit DM "Build semantic index" action remains a recovery/backfill path.

// How many docs to embed per provider call. Embedding APIs accept large batches;
// 64 keeps each request modest while cutting round-trips on a big campaign.
export const EMBED_BATCH_SIZE = 64;

// Must match the `SearchDoc.embedding vector(1536)` column. A model that returns
// a different dimension is a misconfiguration we surface safely (below) rather
// than letting Postgres throw an opaque error.
export const EMBED_DIMENSIONS = 1536;

/** The text we embed for a SearchDoc — the denormalized `content`, trimmed. Pure. */
export function embeddingInputForDoc(content: string): string {
  return content.trim();
}

/** Format a JS vector as a pgvector literal (`[0.1,0.2,…]`). Pure. */
export function searchVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Embed (or re-embed) a campaign's SearchDocs. DM-only. By default only docs
 * that are not yet embedded with the current model are processed; `force`
 * re-embeds all of them (e.g. after a model change). Resolves an embedding-
 * capable provider, batches the work, and writes each vector via raw SQL. A
 * provider failure becomes a safe `ServiceError` (invariant #6 — no raw text);
 * a wrong-dimension model is rejected with a clear message. Returns how many
 * docs were embedded and the model used.
 */
export async function embedSearchDocs(
  userId: string,
  campaignId: string,
  opts: { force?: boolean } = {},
): Promise<{ embedded: number; model: string }> {
  await assertCampaignDm(userId, campaignId);

  const embedder = await resolveCampaignEmbedder(campaignId);
  if (!embedder) {
    throw new ServiceError(
      "No embedding-capable provider is configured. Add an OpenAI or OpenAI-compatible key to enable semantic search.",
    );
  }

  await assertWithinSpendCap(campaignId);

  // The model this embedder will use — a per-key bring-your-own override or the
  // provider's embedding default. Drives both the "already embedded with this
  // model?" filter below and the returned model; `result.model` matches it after
  // the call. `embeddingModel` is a normal (queryable) column written alongside
  // `embedding`, so "missing or stale" can be expressed without touching the
  // Unsupported vector column: model is null (never embedded) or differs from it.
  const targetModel = embedder.embeddingModel ?? EMBED_MODEL_DEFAULT;
  const docs = await prisma.searchDoc.findMany({
    where: {
      campaignId,
      ...(opts.force
        ? {}
        : { OR: [{ embeddingModel: null }, { embeddingModel: { not: targetModel } }] }),
    },
    select: { id: true, content: true },
  });

  if (docs.length === 0) return { embedded: 0, model: targetModel };

  let embedded = 0;
  try {
    for (let i = 0; i < docs.length; i += EMBED_BATCH_SIZE) {
      const batch = docs.slice(i, i + EMBED_BATCH_SIZE);
      const result = await embedder.embed(batch.map((doc) => embeddingInputForDoc(doc.content)));

      for (let j = 0; j < batch.length; j += 1) {
        const vector = result.vectors[j];
        if (!vector || vector.length !== EMBED_DIMENSIONS) {
          throw new ServiceError(
            `The embedding model returned ${vector?.length ?? 0}-dimensional vectors; ` +
              `semantic search expects ${EMBED_DIMENSIONS}. Configure a ${EMBED_DIMENSIONS}-dimensional model.`,
          );
        }
        const updated = await prisma.$executeRaw(
          Prisma.sql`UPDATE "SearchDoc"
            SET embedding = ${searchVectorLiteral(vector)}::vector, "embeddingModel" = ${result.model}
            WHERE id = ${batch[j].id} AND content = ${batch[j].content}`,
        );
        if (updated > 0) embedded += 1;
      }

      // Cost/usage trail (tokens authoritative; embedding models are usually
      // unpriced → null cost). Best-effort: never fail the backfill over it.
      try {
        await recordAiUsage({
          campaignId,
          userId,
          providerId: embedder.id,
          model: result.model,
          generatorId: "embed-search",
          usage: result.usage,
        });
      } catch {
        // Usage recording is non-critical; the embeddings are already persisted.
      }
    }
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(describeProviderError(error));
  }

  return { embedded, model: targetModel };
}
