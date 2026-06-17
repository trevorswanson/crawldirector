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

// Walk the `.cause` chain and surface each link's name + errno `code`. fetch and
// the provider SDKs nest the real failure several layers down — an
// APIConnectionError (message "Connection error.") wraps a TypeError("fetch
// failed") whose `.cause` is the actual undici/Node error carrying the
// actionable `code` (ETIMEDOUT, ECONNREFUSED, ENOTFOUND, CERT_*, our
// EAI_BLOCKED, …). The `code` is a fixed identifier and always safe. The message
// is a system string ("connect ETIMEDOUT 1.2.3.4:443"), so we include a bounded
// copy only for non-HTTP errors — mirroring the status-only rule above so an
// HTTP error body can never re-leak endpoint config (invariant #6).
function causeChain(error: Error, includeMessages: boolean): string {
  const parts: string[] = [];
  let cur: unknown = (error as { cause?: unknown }).cause;
  for (let depth = 0; cur instanceof Error && depth < 5; depth += 1) {
    const code = (cur as { code?: unknown }).code;
    const codeStr = typeof code === "string" ? ` code=${code}` : "";
    const msg = includeMessages ? `: ${cur.message.slice(0, 200)}` : "";
    parts.push(`  caused by [${cur.name}${codeStr}]${msg}`);
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.length > 0 ? `\n${parts.join("\n")}` : "";
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
    console.error(
      `${context}: [${error.name}] ${message}`,
      stackFrames(error) + causeChain(error, status === undefined),
    );
    return;
  }
  console.error(`${context}: non-Error thrown (${typeof error})`);
}
