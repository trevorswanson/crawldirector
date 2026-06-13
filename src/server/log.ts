// Key-safe server logging (invariant #6: secrets never reach logs). Raw error
// objects from provider SDKs / user-configured endpoints can carry request
// config or response bodies; we log name + a bounded message + stack FRAMES,
// and for HTTP-shaped errors (anything exposing a numeric `status`) we follow
// describeProviderError's rule (src/server/ai/index.ts): status code only,
// never the upstream free text.
//
// Frames-only is load-bearing: a V8 `error.stack` BEGINS with
// "Error: <message>" (and a multi-line message spans several lines before the
// frames), so logging the raw stack would re-leak the exact text the message
// rule withholds. Keep only the "    at …" frame lines.
function stackFrames(error: Error): string {
  return (error.stack ?? "")
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .join("\n");
}

export function logActionError(context: string, error: unknown): void {
  if (error instanceof Error) {
    const status =
      typeof (error as { status?: unknown }).status === "number"
        ? (error as unknown as { status: number }).status
        : undefined;
    const message =
      status !== undefined
        ? `HTTP ${status} from upstream (message withheld — may echo endpoint config)`
        : error.message.slice(0, 500);
    console.error(`${context}: [${error.name}] ${message}`, stackFrames(error));
    return;
  }
  console.error(`${context}: non-Error thrown (${typeof error})`);
}
