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
      "::ffff:127.0.0.1", // IPv4-mapped loopback
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
    // localhost resolves offline to 127.0.0.1 — also blocked.
    await expect(assertPublicEndpoint("http://localhost:11434/v1")).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it("allows a public IP literal when private endpoints are off", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_ENDPOINTS", "");
    await expect(assertPublicEndpoint("https://1.1.1.1/v1")).resolves.toBeUndefined();
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
});
