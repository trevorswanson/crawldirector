"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { searchEntityCandidatesAction } from "@/app/(dm)/actions";
import { EntityTypeahead, type EntityCandidate } from "@/components/entities/entity-typeahead";
import { TypeDot } from "@/components/ui/type-dot";
import { formatEntityType } from "@/lib/entities";

/**
 * Multi-entity tag picker for a session log entry ("optionally tagged to
 * existing entities" — docs/08-session-mode.md). Rather than parse `@Name`/
 * `#Name` mentions out of freeform text (fragile for multi-word entity names
 * with no existing mention infra in this repo), the DM picks entities from the
 * same search-as-you-type `EntityTypeahead` used elsewhere, building a chip
 * list. Each pick submits as a repeated hidden `taggedIds` input, so the
 * component still drops into a plain `<form action>` with no extra wiring.
 */
export function SessionTagPicker({
  campaignId,
  candidates,
}: {
  campaignId: string;
  candidates: EntityCandidate[];
}) {
  const [tags, setTags] = useState<EntityCandidate[]>([]);
  const excludeIds = useMemo(() => tags.map((tag) => tag.id), [tags]);
  const pickableCandidates = useMemo(
    () => candidates.filter((candidate) => !excludeIds.includes(candidate.id)),
    [candidates, excludeIds],
  );

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-[6px]">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-[5px] border border-[var(--line-strong)] bg-[var(--bg-3)] px-[8px] py-[4px] text-[11px] text-[var(--ink)]"
            >
              <input type="hidden" name="taggedIds" value={tag.id} />
              <TypeDot type={tag.type} size={6} />
              {tag.name}
              <span className="font-mono text-[8.5px] uppercase tracking-[.05em] text-[var(--ink-faint)]">
                {formatEntityType(tag.type)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${tag.name} tag`}
                onClick={() => setTags((prev) => prev.filter((t) => t.id !== tag.id))}
                className="inline-flex items-center text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                <X aria-hidden size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <EntityTypeahead
        name="_tagSearch"
        candidates={pickableCandidates}
        searchCandidates={(query) =>
          searchEntityCandidatesAction(campaignId, query, { excludeIds }).then((results) =>
            results.filter((candidate) => !excludeIds.includes(candidate.id)),
          )
        }
        value={null}
        onChange={(candidate) => {
          if (!candidate) return;
          setTags((prev) => (prev.some((t) => t.id === candidate.id) ? prev : [...prev, candidate]));
        }}
        placeholder="Tag an entity (optional)…"
        emptyLabel="No matching entities."
      />
    </div>
  );
}
