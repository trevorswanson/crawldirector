import { describe, expect, it } from "vitest";
import { withCampaignAiLock, lockTailCountForTests } from "@/server/services/ai-lock";

// Pure logic tests — no DB, no external dependencies.

describe("withCampaignAiLock", () => {
  it("serializes two calls for the same campaign — second fn does not start before first finishes", async () => {
    const order: string[] = [];

    let resolveFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => { resolveFirst = resolve; });

    const first = withCampaignAiLock("c1", async () => {
      order.push("first:start");
      await firstDone;
      order.push("first:end");
    });

    const second = withCampaignAiLock("c1", async () => {
      order.push("second:start");
    });

    // Give the second call a chance to (incorrectly) start while first is still running.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // First is still in flight; second must not have started yet.
    expect(order).toEqual(["first:start"]);

    resolveFirst();
    await Promise.allSettled([first, second]);

    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("does NOT serialize calls for different campaign ids — both fns run concurrently", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const makeFn = () => async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      // Yield to let the other lock's fn start if it's going to.
      await Promise.resolve();
      await Promise.resolve();
      concurrentCount--;
    };

    await Promise.all([
      withCampaignAiLock("campaign-A", makeFn()),
      withCampaignAiLock("campaign-B", makeFn()),
    ]);

    expect(maxConcurrent).toBe(2);
  });

  it("releases the lock and propagates rejection when fn rejects", async () => {
    const error = new Error("boom");

    await expect(
      withCampaignAiLock("c2", async () => { throw error; }),
    ).rejects.toBe(error);

    // The lock must be released — a subsequent call must run.
    const order: string[] = [];
    await withCampaignAiLock("c2", async () => { order.push("ran"); });
    expect(order).toEqual(["ran"]);
  });

  it("cleanup: map entry is removed after a single run completes (no leak)", async () => {
    await withCampaignAiLock("c3", async () => {});
    expect(lockTailCountForTests()).toBe(0);
  });

  it("cleanup: map entry is removed after two queued runs both settle", async () => {
    let resolveFirst!: () => void;
    const gate = new Promise<void>((resolve) => { resolveFirst = resolve; });

    const first = withCampaignAiLock("c4", () => gate);
    const second = withCampaignAiLock("c4", async () => {});

    // While first is in flight the map has an entry.
    await Promise.resolve();
    expect(lockTailCountForTests()).toBeGreaterThanOrEqual(1);

    resolveFirst();
    await Promise.allSettled([first, second]);

    expect(lockTailCountForTests()).toBe(0);
  });

  it("cleanup: map entry is removed after a rejected fn — no stale tail", async () => {
    // Suppress unhandled rejection noise.
    const p1 = withCampaignAiLock("c5", async () => { throw new Error("fail"); }).catch(() => {});
    await p1;
    expect(lockTailCountForTests()).toBe(0);
  });

  it("cleanup: map entry is removed after the second of two queued runs rejects", async () => {
    let resolveFirst!: () => void;
    const gate = new Promise<void>((resolve) => { resolveFirst = resolve; });

    const first = withCampaignAiLock("c6", () => gate);
    const second = withCampaignAiLock("c6", async () => { throw new Error("second fails"); });

    resolveFirst();
    await Promise.allSettled([first, second]);

    expect(lockTailCountForTests()).toBe(0);
  });

  it("map has an entry while a run is in flight", async () => {
    let resolveRun!: () => void;
    const gate = new Promise<void>((resolve) => { resolveRun = resolve; });

    const run = withCampaignAiLock("c7", () => gate);

    await Promise.resolve();
    expect(lockTailCountForTests()).toBeGreaterThanOrEqual(1);

    resolveRun();
    await run;
    expect(lockTailCountForTests()).toBe(0);
  });
});
