import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logActionError } from "@/server/log";

describe("logActionError", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("logs [Error] and the message for a plain Error", () => {
    logActionError("ctx", new Error("db went away"));
    expect(spy).toHaveBeenCalledOnce();
    const firstArg: string = spy.mock.calls[0]![0] as string;
    expect(firstArg).toContain("[Error]");
    expect(firstArg).toContain("db went away");
  });

  it("withholds the message for an HTTP-shaped error (status present)", () => {
    const err = Object.assign(new Error("SECRET-MARKER-XYZ"), { status: 401 });
    logActionError("ctx", err);
    expect(spy).toHaveBeenCalledOnce();
    // Every argument must be free of the secret marker — this also catches the
    // V8 stack's first "Error: <message>" line if frames-only filtering is broken.
    for (const arg of spy.mock.calls[0]!) {
      expect(String(arg)).not.toContain("SECRET-MARKER-XYZ");
    }
    expect(String(spy.mock.calls[0]![0])).toContain("HTTP 401");
  });

  it("withholds a multi-line message for an HTTP-shaped error", () => {
    const err = Object.assign(new Error("SECRET-A\nSECRET-B"), { status: 500 });
    logActionError("ctx", err);
    expect(spy).toHaveBeenCalledOnce();
    for (const arg of spy.mock.calls[0]!) {
      expect(String(arg)).not.toContain("SECRET-A");
      expect(String(arg)).not.toContain("SECRET-B");
    }
    expect(String(spy.mock.calls[0]![0])).toContain("HTTP 500");
  });

  it("truncates a very long message to at most 500 characters", () => {
    const longMessage = "x".repeat(2000);
    logActionError("ctx", new Error(longMessage));
    expect(spy).toHaveBeenCalledOnce();
    const firstArg: string = spy.mock.calls[0]![0] as string;
    // The logged message portion should be bounded — the full 2000-char string
    // must not appear as a continuous run.
    expect(firstArg).not.toContain("x".repeat(501));
  });

  it("logs non-Error type information and does not include the thrown value", () => {
    logActionError("x", "boom");
    expect(spy).toHaveBeenCalledOnce();
    const firstArg: string = spy.mock.calls[0]![0] as string;
    expect(firstArg).toContain("non-Error thrown");
    expect(firstArg).not.toContain("boom");
  });

  it("redacts a provided secret from the message but keeps the rest diagnosable", () => {
    const redact = (text: string) => text.split("sk-secret-123").join("[redacted]");
    logActionError(
      "ctx",
      new Error("connect failed: Authorization: Bearer sk-secret-123"),
      redact,
    );
    expect(spy).toHaveBeenCalledOnce();
    for (const arg of spy.mock.calls[0]!) {
      expect(String(arg)).not.toContain("sk-secret-123");
    }
    // The non-secret part of the message survives so the failure stays diagnosable.
    expect(String(spy.mock.calls[0]![0])).toContain("connect failed");
    expect(String(spy.mock.calls[0]![0])).toContain("[redacted]");
  });

  it("redacts a provided secret from cause-chain messages", () => {
    const redact = (text: string) => text.split("sk-secret-123").join("[redacted]");
    const root = new Error("undici: invalid response — sk-secret-123 echoed back");
    const err = new Error("Connection error.", { cause: root });
    logActionError("ctx", err, redact);
    expect(spy).toHaveBeenCalledOnce();
    for (const arg of spy.mock.calls[0]!) {
      expect(String(arg)).not.toContain("sk-secret-123");
    }
    // The cause link itself is still surfaced (its name + a redacted message).
    expect(String(spy.mock.calls[0]![1])).toContain("caused by [Error]");
  });

  it("redacts a secret straddling the 500-char message cutoff", () => {
    const redact = (text: string) => text.split("sk-secret-123").join("[redacted]");
    // Place the secret so it begins before char 500 and ends after it; redaction
    // must run before the slice, or fragments of the key would survive.
    const message = "x".repeat(495) + "sk-secret-123" + "y".repeat(100);
    logActionError("ctx", new Error(message), redact);
    expect(spy).toHaveBeenCalledOnce();
    for (const arg of spy.mock.calls[0]!) {
      expect(String(arg)).not.toContain("sk-secret");
    }
  });
});
