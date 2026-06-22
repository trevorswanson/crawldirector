// Dedupe proposed tags case-insensitively, dropping blanks while preserving
// first-seen order and original casing. Shared by the flesh-out and scaffold-stub
// generators, which both turn model-proposed tags into review proposals.
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}
