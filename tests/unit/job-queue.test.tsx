// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/(dm)/actions", () => ({ cancelJobAction: vi.fn() }));

import { JobQueueList } from "@/components/jobs/job-queue-list";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-16T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("JobQueueList", () => {
  it("renders an empty state", () => {
    render(<JobQueueList jobs={[]} />);
    expect(screen.getByText(/No jobs queued yet/i)).toBeTruthy();
  });

  it("distinguishes an empty filtered queue from an empty job history", () => {
    type FilteredProps = Parameters<typeof JobQueueList>[0] & { filtered: boolean };
    const FilteredJobQueueList = JobQueueList as (props: FilteredProps) => ReturnType<typeof JobQueueList>;

    render(<FilteredJobQueueList jobs={[]} filtered />);

    expect(screen.getByText("No jobs match these filters.")).toBeTruthy();
  });

  it("renders semantic, data repair, bulk, and lore job statuses with safe summaries", () => {
    render(
      <JobQueueList
        jobs={[
          {
            id: "semantic",
            kind: "EMBED_SEARCH_DOCS",
            status: "RUNNING",
            error: null,
            result: null,
            createdAt: new Date("2026-06-16T11:55:00Z"),
            startedAt: new Date("2026-06-16T11:56:00Z"),
            finishedAt: null,
          },
          {
            id: "repair",
            kind: "MIGRATE_ENTITY_DATA",
            status: "SUCCEEDED",
            error: null,
            result: { checked: 5, migrated: 2, skipped: 1 },
            createdAt: new Date("2026-06-16T10:30:00Z"),
            startedAt: new Date("2026-06-16T10:31:00Z"),
            finishedAt: new Date("2026-06-16T10:33:00Z"),
          },
          {
            id: "bulk",
            kind: "BULK_FLESH",
            status: "SUCCEEDED",
            error: null,
            result: { proposedCount: 2, skippedCount: 1 },
            createdAt: new Date("2026-06-16T10:00:00Z"),
            startedAt: new Date("2026-06-16T10:01:00Z"),
            finishedAt: new Date("2026-06-16T10:05:00Z"),
          },
          {
            id: "lore",
            kind: "LORE_SEED",
            status: "SUCCEEDED",
            error: null,
            result: { count: 3 },
            createdAt: new Date("2026-06-15T12:00:00Z"),
            startedAt: new Date("2026-06-15T12:01:00Z"),
            finishedAt: new Date("2026-06-15T12:02:00Z"),
          },
          {
            id: "failed",
            kind: "LORE_SEED",
            status: "FAILED",
            error: "Dataset unavailable.",
            result: null,
            createdAt: new Date("2026-06-15T11:00:00Z"),
            startedAt: new Date("2026-06-15T11:01:00Z"),
            finishedAt: new Date("2026-06-15T11:02:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByText("Semantic index")).toBeTruthy();
    expect(screen.getByText("Data repair")).toBeTruthy();
    expect(screen.getByText("Bulk flesh-out")).toBeTruthy();
    expect(screen.getAllByText("Lore seed")).toHaveLength(2);
    expect(screen.getByText("RUNNING")).toBeTruthy();
    expect(screen.getAllByText("SUCCEEDED")).toHaveLength(3);
    expect(screen.getByText("FAILED")).toBeTruthy();
    expect(screen.getByText(/2 repaired, 1 skipped/i)).toBeTruthy();
    expect(screen.getByText(/2 proposed, 1 skipped/i)).toBeTruthy();
    expect(screen.getByText(/3 seeded/i)).toBeTruthy();
    expect(screen.getByText(/Dataset unavailable/i)).toBeTruthy();
  });

  it("renders cancel controls only for queued jobs when a campaign id is available", () => {
    render(
      <JobQueueList
        campaignId="c1"
        jobs={[
          {
            id: "semantic",
            kind: "EMBED_SEARCH_DOCS",
            status: "QUEUED",
            error: null,
            result: null,
            createdAt: new Date("2026-06-16T11:55:00Z"),
            startedAt: null,
            finishedAt: null,
          },
          {
            id: "running",
            kind: "LORE_SEED",
            status: "RUNNING",
            error: null,
            result: null,
            createdAt: new Date("2026-06-16T11:45:00Z"),
            startedAt: new Date("2026-06-16T11:46:00Z"),
            finishedAt: null,
          },
          {
            id: "done",
            kind: "BULK_FLESH",
            status: "SUCCEEDED",
            error: null,
            result: { proposedCount: 1 },
            createdAt: new Date("2026-06-16T10:00:00Z"),
            startedAt: new Date("2026-06-16T10:01:00Z"),
            finishedAt: new Date("2026-06-16T10:05:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel Semantic index job" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel Lore seed job" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel Bulk flesh-out job" })).toBeNull();
  });
});
