import dns from "node:dns";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/errors";
import {
  allowsPrivateEndpoints,
  assertPublicEndpoint,
  createSafeFetch,
  guardedLookup,
  isBlockedAddress,
} from "@/server/ai/ssrf";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local, metadata, multicast, and reserved ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.5.4",
      "192.168.0.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // multicast
      "240.0.0.1", // reserved
      "::1",
      "::",
      "fe80::1", // IPv6 link-local
      "fd00::1", // IPv6 unique-local
      "::ffff:127.0.0.1", // IPv4-mapped loopback (dotted)
      "::ffff:a9fe:a9fe", // IPv4-mapped 169.254.169.254 in hex (WHATWG URL form)
      "::ffff:c0a8:0101", // IPv4-mapped 192.168.1.1 in hex
      "ff02::1", // IPv6 multicast
      "::ffff:1:2:3", // unparseable IPv4-mapped form (≠2 hex groups) — fails closed
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("treats a bare hostname as blocked (caller must resolve it first)", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
  });
});

describe("allowsPrivateEndpoints", () => {
  it("is off unless the env flag is 1/true", () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    expect(allowsPrivateEndpoints()).toBe(false);
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "1");
    expect(allowsPrivateEndpoints()).toBe(true);
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "true");
    expect(allowsPrivateEndpoints()).toBe(true);
  });
});

describe("assertPublicEndpoint", () => {
  it("rejects a non-URL and a non-http(s) scheme", async () => {
    await expect(assertPublicEndpoint("not a url")).rejects.toBeInstanceOf(ServiceError);
    await expect(assertPublicEndpoint("ftp://example.com")).rejects.toBeInstanceOf(ServiceError);
    await expect(assertPublicEndpoint("file:///etc/passwd")).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects loopback/private/metadata literals when private endpoints are off", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    await expect(assertPublicEndpoint("http://127.0.0.1/v1")).rejects.toBeInstanceOf(ServiceError);
    await expect(assertPublicEndpoint("http://[::1]/v1")).rejects.toBeInstanceOf(ServiceError);
    await expect(
      assertPublicEndpoint("http://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(ServiceError);
    // IPv4-mapped IPv6 literal — WHATWG URL normalizes the host to hex form.
    await expect(
      assertPublicEndpoint("http://[::ffff:169.254.169.254]/latest/meta-data"),
    ).rejects.toBeInstanceOf(ServiceError);
    // localhost resolves offline to 127.0.0.1 — also blocked.
    await expect(assertPublicEndpoint("http://localhost:11434/v1")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("allows a public IP literal when private endpoints are off", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    await expect(assertPublicEndpoint("https://1.1.1.1/v1")).resolves.toBeUndefined();
  });

  it("rejects when the host cannot be resolved", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    vi.spyOn(dns.promises, "lookup").mockRejectedValue(new Error("ENOTFOUND"));
    await expect(
      assertPublicEndpoint("https://does-not-resolve.example.test/v1"),
    ).rejects.toThrow(/resolve the endpoint host/i);
  });

  it("short-circuits to allow any http(s) endpoint when private endpoints are on", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "1");
    await expect(assertPublicEndpoint("http://localhost:11434/v1")).resolves.toBeUndefined();
    await expect(assertPublicEndpoint("http://192.168.1.5/v1")).resolves.toBeUndefined();
  });
});

describe("guardedLookup", () => {
  it("errors when a hostname resolves to a blocked address", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      guardedLookup("localhost", { all: true }, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBe("EAI_BLOCKED");
  });

  it("passes through a public IP literal", async () => {
    const { err, address } = await new Promise<{
      err: NodeJS.ErrnoException | null;
      address: unknown;
    }>((resolve) => {
      guardedLookup("8.8.8.8", { all: true }, (e, a) => resolve({ err: e, address: a }));
    });
    expect(err).toBeNull();
    expect(JSON.stringify(address)).toContain("8.8.8.8");
  });

  it("propagates a DNS resolution error untouched", async () => {
    const lookupErr: NodeJS.ErrnoException = new Error("getaddrinfo ENOTFOUND");
    lookupErr.code = "ENOTFOUND";
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (e: unknown, a: unknown, f: unknown) => void,
    ) => {
      cb(lookupErr, "", undefined);
    }) as never);
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      guardedLookup("nope.example.test", { all: true }, (e) => resolve(e));
    });
    // The original resolver error surfaces unchanged (not rewritten to EAI_BLOCKED).
    expect(err?.code).toBe("ENOTFOUND");
  });
});

describe("createSafeFetch", () => {
  it("returns the global fetch unchanged when private endpoints are allowed", () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "1");
    expect(createSafeFetch()).toBe(globalThis.fetch);
  });

  it("returns a wrapper that blocks a private target when private endpoints are off", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    const safeFetch = createSafeFetch();
    expect(safeFetch).not.toBe(globalThis.fetch);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("re-checks the target for URL and Request inputs, not just strings", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    const safeFetch = createSafeFetch();
    // A URL instance — fetchTargetUrl reads .href.
    await expect(
      safeFetch(new URL("http://169.254.169.254/latest/meta-data")),
    ).rejects.toBeInstanceOf(ServiceError);
    // A Request instance — fetchTargetUrl reads .url.
    await expect(
      safeFetch(new Request("http://127.0.0.1/v1")),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("routes a public target through the guarded dispatcher, with and without init", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok"));
    const safeFetch = createSafeFetch();

    // No init: the wrapper synthesizes `{}` before attaching the dispatcher.
    await safeFetch("https://1.1.1.1/v1");
    // With init: existing options are spread through and the dispatcher added.
    await safeFetch("https://1.1.1.1/v1", { method: "POST" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchSpy.mock.calls[0];
    const [, secondInit] = fetchSpy.mock.calls[1];
    expect((firstInit as { dispatcher?: unknown }).dispatcher).toBeDefined();
    expect((secondInit as { dispatcher?: unknown; method?: string }).method).toBe("POST");
    expect((secondInit as { dispatcher?: unknown }).dispatcher).toBeDefined();
  });
});

// A dual-stack / DNS64 / split-horizon resolver hands the app a private (or ULA)
// sibling next to the routable public address — e.g. a container behind NAT64
// where api.mistral.ai resolves to both an `fd00::` address and a public IPv4.
// The guard must allow such a host (and pin the socket to the public address)
// rather than rejecting it as "private".
describe("dual-stack / DNS64 resolution", () => {
  it("assertPublicEndpoint allows a host with a public address despite a private sibling", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "fd00::1", family: 6 }, // ULA sibling (DNS64/NAT64)
      { address: "162.159.142.207", family: 4 }, // routable public
    ] as never);
    await expect(assertPublicEndpoint("https://api.example.test/v1")).resolves.toBeUndefined();
  });

  it("assertPublicEndpoint rejects a host that resolves only to private/ULA addresses", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "fd00::1", family: 6 },
      { address: "10.1.2.3", family: 4 },
    ] as never);
    await expect(assertPublicEndpoint("https://internal.example.test/v1")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("guardedLookup drops blocked addresses and returns only the public ones (all: true)", async () => {
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (e: unknown, a: unknown) => void,
    ) => {
      cb(null, [
        { address: "fd00::1", family: 6 },
        { address: "162.159.142.207", family: 4 },
      ]);
    }) as never);
    const { err, address } = await new Promise<{
      err: NodeJS.ErrnoException | null;
      address: unknown;
    }>((resolve) => {
      guardedLookup("api.example.test", { all: true }, (e, a) => resolve({ err: e, address: a }));
    });
    expect(err).toBeNull();
    expect(address).toEqual([{ address: "162.159.142.207", family: 4 }]);
  });

  it("guardedLookup errors when every resolved address is blocked (all: true)", async () => {
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (e: unknown, a: unknown) => void,
    ) => {
      cb(null, [
        { address: "fd00::1", family: 6 },
        { address: "10.1.2.3", family: 4 },
      ]);
    }) as never);
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      guardedLookup("internal.example.test", { all: true }, (e) => resolve(e));
    });
    expect(err?.code).toBe("EAI_BLOCKED");
  });

  it("guardedLookup returns a single public address unchanged (all: false)", async () => {
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (e: unknown, a: unknown, f: unknown) => void,
    ) => {
      cb(null, "162.159.142.207", 4);
    }) as never);
    const { err, address, family } = await new Promise<{
      err: NodeJS.ErrnoException | null;
      address: unknown;
      family: unknown;
    }>((resolve) => {
      guardedLookup("api.example.test", {}, (e, a, f) =>
        resolve({ err: e, address: a, family: f }),
      );
    });
    expect(err).toBeNull();
    expect(address).toBe("162.159.142.207");
    expect(family).toBe(4);
  });
});
