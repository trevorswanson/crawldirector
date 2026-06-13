// Serializes AI generation per campaign so the spend-cap check, the provider
// call, and the usage record behave as one atomic unit (docs/04-ai-integration
// spend caps). In-process only: this app deploys as a single Node process
// (see Dockerfile); with multiple replicas this lock no longer guards the cap.
// NOT re-entrant — a holder calling withCampaignAiLock again deadlocks, so
// batch orchestrators (fleshOutEntities) must never wrap their per-entity calls.
const tails = new Map<string, Promise<void>>();

export async function withCampaignAiLock<T>(
  campaignId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(campaignId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  // Store the chained promise in a local: the cleanup below must compare
  // against the EXACT object placed in the map. Comparing against `current`
  // instead would never match, every campaign's entry would live forever,
  // and a long-running process would leak one stale promise per campaign.
  const tail = previous.then(() => current);
  tails.set(campaignId, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    // Drop the tail entry when no one queued behind us, so the map can't grow
    // unboundedly across campaigns.
    if (tails.get(campaignId) === tail) tails.delete(campaignId);
  }
}

// Test-only introspection: how many campaigns currently hold a tail entry.
// Pins the cleanup behavior above; not for production use.
export function lockTailCountForTests(): number {
  return tails.size;
}
