import { notFound } from "next/navigation";
import { Check, Save, X } from "lucide-react";

import {
  approveChangeSetAction,
  editChangeOperationPatchAction,
  rejectChangeSetAction,
  setChangeOperationDecisionAction,
} from "@/app/(dm)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HudTag } from "@/components/ui/hud-tag";
import { Input } from "@/components/ui/input";
import { Kicker } from "@/components/ui/kicker";
import { SourceBadge } from "@/components/ui/source-badge";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { PageContainer } from "@/components/console/page-container";
import { requireUser } from "@/server/auth/session";
import { getCampaignForUser } from "@/server/services/campaigns";
import {
  listPendingChangeSetsForUser,
  type ReviewPatch,
} from "@/server/services/review";

export default async function ReviewQueuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaignForUser(user.id, id);

  if (!campaign) notFound();

  const changeSets = await listPendingChangeSetsForUser(user.id, id);

  return (
    <PageContainer>
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div>
          <Kicker>Canon Control</Kicker>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Review Queue
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Pending proposals wait here until a DM approves or rejects them.
          </p>
        </div>
      </div>

      {changeSets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No pending proposals</CardTitle>
            <CardDescription>
              Direct DM edits are auto-approved with provenance. AI, import, and
              player-suggestion proposals will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="grid gap-4">
          {changeSets.map((changeSet) => (
            <Card key={changeSet.id}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge source={changeSet.source} />
                  <StatusPill status={changeSet.status} />
                  <HudTag>
                    {changeSet.operations.length} operation
                    {changeSet.operations.length === 1 ? "" : "s"}
                  </HudTag>
                  {changeSet.operations.some((operation) => operation.blockedByLock) && (
                    <HudTag>Blocked</HudTag>
                  )}
                  {changeSet.operations.some((operation) => operation.isStale) && (
                    <HudTag>Stale</HudTag>
                  )}
                </div>
                <div>
                  <CardTitle>{changeSet.title}</CardTitle>
                  {changeSet.summary && (
                    <CardDescription>{changeSet.summary}</CardDescription>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-3">
                  {changeSet.operations.map((operation) => (
                    <div key={operation.id} className="panel p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <HudTag>{operation.op.replaceAll("_", " ")}</HudTag>
                        <HudTag>{operation.decision.replaceAll("_", " ")}</HudTag>
                        {operation.targetId && (
                          <HudTag>Target · {operation.targetId.slice(0, 8)}</HudTag>
                        )}
                      </div>
                      <EditableDiffForm
                        action={editChangeOperationPatchAction.bind(
                          null,
                          id,
                          changeSet.id,
                          operation.id,
                        )}
                        editedPatch={operation.editedPatch as ReviewPatch | null}
                        patch={operation.patch as ReviewPatch}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <form
                          action={setChangeOperationDecisionAction.bind(
                            null,
                            id,
                            changeSet.id,
                            operation.id,
                            "ACCEPTED",
                          )}
                        >
                          <Button
                            type="submit"
                            size="sm"
                            variant={
                              operation.decision === "ACCEPTED" ? "ok" : "outline"
                            }
                          >
                            <Check aria-hidden size={14} />
                            Accept op
                          </Button>
                        </form>
                        <form
                          action={setChangeOperationDecisionAction.bind(
                            null,
                            id,
                            changeSet.id,
                            operation.id,
                            "REJECTED",
                          )}
                        >
                          <Button
                            type="submit"
                            size="sm"
                            variant={
                              operation.decision === "REJECTED"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            <X aria-hidden size={14} />
                            Reject op
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={approveChangeSetAction.bind(null, id, changeSet.id)}>
                    <Button type="submit">
                      <Check aria-hidden size={16} />
                      Approve
                    </Button>
                  </form>
                  <form action={rejectChangeSetAction.bind(null, id, changeSet.id)}>
                    <Button type="submit" variant="outline">
                      <X aria-hidden size={16} />
                      Reject
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
    </PageContainer>
  );
}

function EditableDiffForm({
  action,
  editedPatch,
  patch,
}: {
  action: (formData: FormData) => void | Promise<void>;
  editedPatch: ReviewPatch | null;
  patch: ReviewPatch;
}) {
  const entries = Object.entries(patch).filter(([field]) => field !== "_baseVersion");
  return (
    <form action={action} className="grid gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left font-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink-faint)]">
              <th className="w-20 py-2 pr-3 font-medium">Apply</th>
              <th className="py-2 pr-3 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">Proposed</th>
              <th className="py-2 pl-3 font-medium">Edited</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([field, value]) => {
              const editedValue = editedPatch?.[field]?.to;
              const hasEditedField = Boolean(editedPatch && field in editedPatch);
              const inputValue = hasEditedField ? editedValue : value.to;
              const kind = reviewInputKind(inputValue);

              return (
                <tr key={field} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-3 align-top">
                    <input type="hidden" name="field" value={field} />
                    <input type="hidden" name={`kind:${field}`} value={kind} />
                    <input
                      aria-label={`Apply ${field}`}
                      className="mt-2 size-4 accent-[var(--accent)]"
                      defaultChecked={!editedPatch || hasEditedField}
                      name={`apply:${field}`}
                      type="checkbox"
                    />
                  </td>
                  <td className="py-2 pr-3 align-top font-mono text-[12px] text-[var(--ink-dim)]">
                    {field}
                  </td>
                  <td className="px-3 py-2 align-top text-[var(--ink-faint)]">
                    {formatReviewValue(value.from)}
                  </td>
                  <td className="px-3 py-2 align-top text-[var(--ink)]">
                    {formatReviewValue(value.to)}
                  </td>
                  <td className="py-2 pl-3 align-top">
                    <ReviewValueInput
                      field={field}
                      kind={kind}
                      value={inputValue}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button type="submit" size="sm" variant="outline">
          <Save aria-hidden size={14} />
          Save edits
        </Button>
      </div>
    </form>
  );
}

function ReviewValueInput({
  field,
  kind,
  value,
}: {
  field: string;
  kind: ReviewInputKind;
  value: unknown;
}) {
  const name = `value:${field}`;
  if (kind === "boolean") {
    return (
      <select
        className="h-10 w-full rounded-[2px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        defaultValue={value === false ? "false" : "true"}
        name={name}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (kind === "json") {
    return (
      <Textarea
        className="min-h-20 font-mono text-xs"
        defaultValue={JSON.stringify(value, null, 2)}
        name={name}
      />
    );
  }

  if (kind === "string" && String(value ?? "").length > 80) {
    return (
      <Textarea
        className="min-h-20"
        defaultValue={formatInputValue(value, kind)}
        name={name}
      />
    );
  }

  return (
    <Input
      defaultValue={formatInputValue(value, kind)}
      name={name}
      type={kind === "number" ? "number" : "text"}
    />
  );
}

function formatReviewValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "Empty";
  if (Array.isArray(value)) return value.join(", ") || "Empty";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type ReviewInputKind = "array" | "boolean" | "json" | "number" | "string";

function reviewInputKind(value: unknown): ReviewInputKind {
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value && typeof value === "object") return "json";
  return "string";
}

function formatInputValue(value: unknown, kind: ReviewInputKind) {
  if (kind === "array" && Array.isArray(value)) return value.join(", ");
  if (value === undefined || value === null) return "";
  return String(value);
}
