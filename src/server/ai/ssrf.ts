import dns from "node:dns";
import net from "node:net";

import { Agent } from "undici";

import { ServiceError } from "@/lib/errors";

// SSRF guard for DM-configured OpenAI-compatible provider endpoints (CWE-918 —
// finding CAND-AI-SSRF-001). A campaign DM can point the provider `baseUrl` at
// any http/https URL, which becomes outbound egress from the application server.
// Self-hosted/local endpoints (Ollama, LM Studio, vLLM) are an intended product
// feature, so we don't ban private ranges outright — instead we default-deny
// loopback/link-local/private/metadata targets and let a single-tenant or local
// deployment opt back in with AI_ALLOW_PRIVATE_ENDPOINTS=1. Enforcement happens
// twice: at store time (a fast, friendly error on a typo or obvious attack) and
// at connect time via a custom undici DNS lookup (authoritative — it runs for
// every socket the request opens, so a hostname that rebinds to a private
// address after the store-time check is still blocked).

// Whether this deployment permits provider endpoints on private/loopback
// addresses. Off by default so the multi-tenant threat model holds; single-tenant
// and local-dev installs set the flag to use a self-hosted endpoint.
export function allowsPrivateEndpoints(): boolean {
  const flag = process.env.AI_ALLOW_PRIVATE_ENDPOINTS;
  return flag === "1" || flag === "true";
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function ipv4InRange(value: number, base: string, bits: number): boolean {
  const baseValue = ipv4ToInt(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable — fail closed
  return (
    ipv4InRange(value, "0.0.0.0", 8) || //       "this" network / unspecified
    ipv4InRange(value, "10.0.0.0", 8) || //      private
    ipv4InRange(value, "100.64.0.0", 10) || //   CGNAT
    ipv4InRange(value, "127.0.0.0", 8) || //     loopback
    ipv4InRange(value, "169.254.0.0", 16) || //  link-local + cloud metadata (169.254.169.254)
    ipv4InRange(value, "172.16.0.0", 12) || //   private
    ipv4InRange(value, "192.0.0.0", 24) || //    IETF protocol assignments
    ipv4InRange(value, "192.168.0.0", 16) || //  private
    ipv4InRange(value, "198.18.0.0", 15) || //   benchmarking
    ipv4InRange(value, "224.0.0.0", 4) || //     multicast
    ipv4InRange(value, "240.0.0.0", 4) //        reserved
  );
}

// Decode the IPv4 embedded in an IPv4-mapped IPv6 literal. The suffix after
// `::ffff:` can be dotted-decimal (`169.254.169.254`) or — as the WHATWG URL
// parser serializes it — two hex groups (`a9fe:a9fe`); decode both so the
// embedded address still gets judged by the IPv4 rules.
function mappedIpv4(suffix: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(suffix)) return suffix;
  const groups = suffix.split(":");
  if (groups.length === 2) {
    const hi = Number.parseInt(groups[0], 16);
    const lo = Number.parseInt(groups[1], 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
  }
  return null;
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip any zone id
  const mapped = /^::ffff:([0-9a-f.:]+)$/.exec(addr); // IPv4-mapped (dotted or hex)
  if (mapped) {
    const embedded = mappedIpv4(mapped[1]);
    if (embedded) return isBlockedIpv4(embedded); // judge the embedded v4
    return true; // unparseable mapped form — fail closed
  }
  if (addr === "::" || addr === "::1") return true; //   unspecified / loopback
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local fc00::/7
  if (/^fe[89ab]/.test(addr)) return true; //            link-local fe80::/10
  if (addr.startsWith("ff")) return true; //             multicast
  return false;
}

// True for any address that must not be a server-side egress target: loopback,
// private, link-local, multicast, metadata, and reserved ranges. A non-literal
// (a hostname) returns true so callers know they must resolve it to IPs first.
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true;
}

// Store-time check: parse, enforce http/https, resolve the host, and reject any
// endpoint that resolves to a non-public address (unless private endpoints are
// allowed). Catches literal IPs and offline-resolvable names (localhost) without
// a network round-trip; a public hostname is resolved via DNS.
export async function assertPublicEndpoint(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ServiceError("Enter a valid endpoint URL (e.g. http://localhost:11434/v1).");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServiceError("The endpoint URL must use http or https.");
  }
  if (allowsPrivateEndpoints()) return;

  const host = url.hostname.replace(/^\[|\]$/g, ""); // unwrap [::1]-style literals
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      const records = await dns.promises.lookup(host, { all: true });
      addresses = records.map((record) => record.address);
    } catch {
      throw new ServiceError("Could not resolve the endpoint host.");
    }
  }
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new ServiceError(
      "That endpoint resolves to a private or loopback address. " +
        "Set AI_ALLOW_PRIVATE_ENDPOINTS=1 to allow local or self-hosted endpoints.",
    );
  }
}

// Connect-time DNS guard: undici calls this for every socket it opens (including
// redirect hops), so a hostname that resolves to a blocked address — or rebinds
// to one after the store-time check — never gets connected. Exported for tests.
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
): void {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) {
      callback(err, address as string, family);
      return;
    }
    const entries: dns.LookupAddress[] = Array.isArray(address)
      ? address
      : [{ address: address as string, family: family as number }];
    const blocked = entries.find((entry) => isBlockedAddress(entry.address));
    if (blocked) {
      const error: NodeJS.ErrnoException = new Error(
        `Blocked egress to non-public address ${blocked.address}`,
      );
      error.code = "EAI_BLOCKED";
      callback(error, address, family);
      return;
    }
    callback(null, address, family);
  });
}

const guardedAgent = new Agent({
  connect: { lookup: guardedLookup as never },
});

// A `fetch` for the provider SDKs that enforces the egress policy. Returns the
// global fetch unchanged when private endpoints are allowed; otherwise re-checks
// the target URL (catching literal private IPs and DNS rebinding at call time)
// and routes the request through the connect-time–guarded dispatcher.
export function createSafeFetch(): typeof fetch {
  if (allowsPrivateEndpoints()) return fetch;
  const safeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    await assertPublicEndpoint(target);
    return fetch(input, { ...(init ?? {}), dispatcher: guardedAgent } as RequestInit);
  };
  return safeFetch as typeof fetch;
}
