// Lightweight custom-event channel for campaign-status invalidation. The global
// header HUD (GlobalCampaignStatus) listens for this event and re-fetches the
// current floor / day; mutation sites (floor-change, event create/apply, etc.)
// dispatch it after a successful write so the HUD stays fresh without polling.

const EVENT_NAME = "campaign-status-changed";

/** Signal that the campaign's floor or day status may have changed. */
export function invalidateCampaignStatus(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

/** Subscribe to campaign-status invalidation; returns an unsubscribe function. */
export function onCampaignStatusInvalidated(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
