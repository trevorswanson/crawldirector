// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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

  it("renders semantic, bulk, and lore job statuses with safe summaries", () => {
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
            status: "FAILED",
            error: "Dataset unavailable.",
            result: null,
            createdAt: new Date("2026-06-15T12:00:00Z"),
            startedAt: new Date("2026-06-15T12:01:00Z"),
            finishedAt: new Date("2026-06-15T12:02:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByText("Semantic index")).toBeTruthy();
    expect(screen.getByText("Bulk flesh-out")).toBeTruthy();
    expect(screen.getByText("Lore seed")).toBeTruthy();
    expect(screen.getByText("RUNNING")).toBeTruthy();
    expect(screen.getByText("SUCCEEDED")).toBeTruthy();
    expect(screen.getByText("FAILED")).toBeTruthy();
    expect(screen.getByText(/2 proposed, 1 skipped/i)).toBeTruthy();
    expect(screen.getByText(/Dataset unavailable/i)).toBeTruthy();
  });
});
