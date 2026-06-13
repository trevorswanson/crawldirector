/**
 * Async job worker (M4 — docs/04-ai-integration.md §"Async / batching").
 * Polls the Job queue, claims the oldest due job, runs its handler, and
 * marks it SUCCEEDED or FAILED. Run with: npm run worker
 *
 * Single-worker assumption: only one worker process runs at a time. The
 * claim logic in the jobs service uses an optimistic guard that prevents
 * double-claiming even if a second worker is accidentally started, but the
 * spend-cap lock (M4 plan 004) is in-process — two workers do not serialise
 * against each other. See the maintenance notes in plans/006-job-table-worker.md.
 */
import "dotenv/config";
import { prisma } from "@/server/db";
import { claimNextJob, completeJob, failJob } from "@/server/services/jobs";
import { jobHandlers } from "@/server/jobs/handlers";
import { ServiceError } from "@/lib/errors";

const POLL_INTERVAL_MS = 2000;

let shuttingDown = false;
let inFlight: string | null = null;

async function runLoop() {
  console.log("[worker] started, polling for jobs...");

  while (!shuttingDown) {
    const job = await claimNextJob();

    if (!job) {
      // Queue is empty — wait before polling again.
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    inFlight = job.id;
    console.log(`[worker] claimed job ${job.id} (${job.kind})`);

    try {
      const handler = jobHandlers[job.kind];
      const result = await handler(job);
      await completeJob(job.id, result);
      console.log(`[worker] job ${job.id} SUCCEEDED`);
    } catch (err) {
      const safeMessage =
        err instanceof ServiceError ? err.message : "Job failed.";
      await failJob(job.id, safeMessage);
      console.log(`[worker] job ${job.id} FAILED: ${safeMessage}`);
    } finally {
      inFlight = null;
    }
  }

  // Graceful shutdown: disconnect before exiting.
  await prisma.$disconnect();
  console.log("[worker] shut down cleanly.");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function handleSignal(signal: string) {
  console.log(`[worker] received ${signal}, finishing in-flight job then exiting...`);
  shuttingDown = true;
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

runLoop().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
