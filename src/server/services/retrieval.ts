import { searchCanon } from "@/server/services/search";
import { SEARCH_TARGET_ENTITY } from "@/server/services/search-index";

// Retrieval-augmented context for generators & agents (M5 slice 6 —
// docs/07-search-retrieval.md §"Retrieval-augmented context").
//
// A thin seam over `searchCanon` that assembles the *relevant* slice of canon for
// a generation run, replacing ad-hoc canon-dumping (e.g. "load the first N
// entities alphabetically"). At DCC's scale a campaign holds thousands of
// entities, so an arbitrary slice rarely contains the ones a task actually needs;
// retrieval surfaces them by keyword + semantic similarity instead.
//
// Two of the doc's guarantees fall out of reusing `searchCanon`:
//   - **Scope honored.** `searchCanon` projects by the requester's role, so a DM
//     generator sees full canon while a future in-character agent path would only
//     retrieve player-visible canon (invariant #5 — fog of war).
//   - **Graceful degradation.** Semantic ranking is additive inside `searchCanon`;
//     a campaign with no embedding-capable key still gets full-text retrieval.
//
// Locks are honored by the *consumer*: this seam returns relevance-ranked ids and
// the caller fetches the details it needs under its own lock/eligibility filter
// (a locked entity can still be read-only reference, but the relationship-
// inference caller deliberately keeps it out of its proposable candidate set).

const DEFAULT_RELATED_LIMIT = 40;

/**
 * Build a full-text/semantic seed query from an entity's salient identifiers
 * (name + tags). Terms are OR-joined: `websearch_to_tsquery` treats whitespace as
 * implicit AND, so a long natural-language seed would over-constrain the
 * full-text arm and match almost nothing in a no-embedder campaign. ORing the
 * salient terms keeps recall high there, and the same string seeds the semantic
 * arm when an embedder is configured. Returns "" when there's nothing to seed on.
 */
export function buildEntityRetrievalQuery(seed: {
  name: string;
  tags: string[];
}): string {
  const terms = [seed.name, ...seed.tags]
    .map((term) => term.trim())
    .filter(Boolean);
  return terms.join(" or ");
}

/**
 * Retrieve the ids of canon entities most relevant to `seed`, in rank order,
 * scoped to what `userId` may see, excluding the seed entity itself. Returns an
 * empty list when the seed has nothing to query on or retrieval finds nothing
 * (the caller decides how to fall back).
 */
export async function retrieveRelatedEntityIds(
  userId: string,
  campaignId: string,
  seed: { id: string; name: string; tags: string[] },
  options: { limit?: number } = {},
): Promise<string[]> {
  const query = buildEntityRetrievalQuery(seed);
  if (!query) return [];

  const limit = options.limit ?? DEFAULT_RELATED_LIMIT;
  // Constrain the scan to ENTITY docs so relationship/event matches can't consume
  // the LIMIT window and push relevant entities off the page. Over-fetch by one so
  // dropping the seed itself can't shrink us below the requested limit.
  const result = await searchCanon(userId, campaignId, query, {
    limit: limit + 1,
    targetTypes: [SEARCH_TARGET_ENTITY],
  });

  const ids: string[] = [];
  for (const hit of result.hits) {
    if (hit.targetId === seed.id) continue;
    ids.push(hit.targetId);
    if (ids.length >= limit) break;
  }
  return ids;
}
