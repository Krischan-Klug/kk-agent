import { lookup } from "node:dns/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage, RequestOptions } from "node:http";
import { WebToolError, asWebToolError } from "./errors.js";
import type { WebResource } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; KK-Agent/1.0; +https://github.com/)";

export interface SafeFetchOptions {
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  allowPrivateAddresses?: boolean;
}

function normalizeUrl(input: string): URL {
  const value = input.trim();
  if (!value) throw new WebToolError("URL is required.", "invalid_input");
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//iu.test(value) ? value : `https://${value}`);
  } catch {
    throw new WebToolError(`Invalid URL: ${input}`, "invalid_input");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebToolError(`Unsupported URL protocol: ${parsed.protocol}`, "invalid_input", { url: parsed.toString() });
  }
  if (parsed.username || parsed.password) {
    throw new WebToolError("URLs containing credentials are not allowed.", "invalid_input", { url: parsed.toString() });
  }
  parsed.hash = "";
  return parsed;
}

function ipv4Number(address: string): number | undefined {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

export function isPrivateOrReservedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    if (value === undefined) return true;
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) => inIpv4Range(value, ipv4Number(base as string)!, prefix as number));
  }
  if (family === 6) {
    const normalized = address.toLowerCase().split("%")[0]!;
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("::ffff:")) return isPrivateOrReservedAddress(normalized.slice(7));
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true;
    if ((first & 0xffc0) === 0xfe80) return true;
    if ((first & 0xff00) === 0xff00) return true;
    if (normalized.startsWith("2001:db8:")) return true;
    return false;
  }
  return true;
}

async function resolvePublicAddress(hostname: string, allowPrivateAddresses: boolean): Promise<{ address: string; family: 4 | 6 }> {
  const lower = hostname.toLowerCase().replace(/\.$/u, "");
  if (!allowPrivateAddresses && (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local"))) {
    throw new WebToolError(`Access to local host "${hostname}" is blocked.`, "blocked_address");
  }

  const literalFamily = isIP(lower);
  const addresses = literalFamily
    ? [{ address: lower, family: literalFamily as 4 | 6 }]
    : await lookup(lower, { all: true, verbatim: true });
  if (addresses.length === 0) throw new WebToolError(`Could not resolve host "${hostname}".`, "network_error", { retryable: true });
  if (!allowPrivateAddresses && addresses.some((entry) => isPrivateOrReservedAddress(entry.address))) {
    throw new WebToolError(`Access to private or reserved address for "${hostname}" is blocked.`, "blocked_address");
  }
  return addresses[0] as { address: string; family: 4 | 6 };
}

function responseHeaders(response: IncomingMessage): Record<string, string> {
  return Object.fromEntries(Object.entries(response.headers).flatMap(([key, value]) => {
    if (value === undefined) return [];
    return [[key.toLowerCase(), Array.isArray(value) ? value.join(", ") : value]];
  }));
}

async function requestOnce(url: URL, options: Required<Pick<SafeFetchOptions, "timeoutMs" | "maxBytes">> & SafeFetchOptions): Promise<{
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}> {
  const resolved = await resolvePublicAddress(url.hostname, options.allowPrivateAddresses === true);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.abortSignal?.aborted) abort();
  else options.abortSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs);

  try {
    return await new Promise((resolve, reject) => {
      const request = url.protocol === "https:" ? requestHttps : requestHttp;
      const requestOptions: RequestOptions = {
        method: "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/pdf,text/plain,application/json;q=0.9,*/*;q=0.5",
          "accept-encoding": "identity",
          ...options.headers,
        },
        signal: controller.signal,
        lookup: ((_hostname: string, lookupOptions: unknown, callback: (...args: unknown[]) => void) => {
          const wantsAll = Boolean(lookupOptions && typeof lookupOptions === "object" && "all" in lookupOptions && (lookupOptions as { all?: boolean }).all);
          if (wantsAll) callback(null, [resolved]);
          else callback(null, resolved.address, resolved.family);
        }) as RequestOptions["lookup"],
      };
      const req = request(url, requestOptions, (response) => {
        const headers = responseHeaders(response);
        const declaredLength = Number(headers["content-length"] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
          response.destroy();
          reject(new WebToolError(`Response exceeds the ${options.maxBytes}-byte limit.`, "body_too_large", { url: url.toString() }));
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer | Uint8Array | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > options.maxBytes) {
            response.destroy(new WebToolError(`Response exceeds the ${options.maxBytes}-byte limit.`, "body_too_large", { url: url.toString() }));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks) }));
        response.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    });
  } catch (error) {
    if (controller.signal.aborted) {
      if (options.abortSignal?.aborted) throw new WebToolError("Web request was aborted.", "aborted", { url: url.toString() });
      throw new WebToolError(`Web request timed out after ${options.timeoutMs}ms.`, "timeout", { retryable: true, url: url.toString() });
    }
    throw asWebToolError(error, url.toString());
  } finally {
    clearTimeout(timer);
    options.abortSignal?.removeEventListener("abort", abort);
  }
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<WebResource> {
  const started = Date.now();
  const timeoutMs = Math.min(60_000, Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const maxBytes = Math.min(25 * 1024 * 1024, Math.max(1_024, options.maxBytes ?? DEFAULT_MAX_BYTES));
  const maxRedirects = Math.min(10, Math.max(0, options.maxRedirects ?? DEFAULT_MAX_REDIRECTS));
  const requestedUrl = normalizeUrl(input).toString();
  let current = new URL(requestedUrl);
  const redirects: string[] = [];

  for (let redirectCount = 0; ; redirectCount += 1) {
    const remainingMs = timeoutMs - (Date.now() - started);
    if (remainingMs <= 0) {
      throw new WebToolError(`Web request timed out after ${timeoutMs}ms.`, "timeout", {
        retryable: true,
        url: current.toString(),
      });
    }
    const response = await requestOnce(current, { ...options, timeoutMs: remainingMs, maxBytes });
    if (!isRedirect(response.status)) {
      return {
        requestedUrl,
        finalUrl: current.toString(),
        status: response.status,
        headers: response.headers,
        body: response.body,
        redirects,
        durationMs: Date.now() - started,
      };
    }

    const location = response.headers.location;
    if (!location) throw new WebToolError("Redirect response did not include a Location header.", "redirect_error", { status: response.status, url: current.toString() });
    if (redirectCount >= maxRedirects) throw new WebToolError(`Web request exceeded ${maxRedirects} redirects.`, "redirect_error", { url: current.toString() });
    const next = normalizeUrl(new URL(location, current).toString());
    redirects.push(next.toString());
    current = next;
  }
}

export function requireSuccessfulStatus(resource: WebResource): void {
  if (resource.status >= 200 && resource.status < 300) return;
  throw new WebToolError(`Web server returned HTTP ${resource.status}.`, "http_error", {
    status: resource.status,
    retryable: resource.status === 408 || resource.status === 429 || resource.status >= 500,
    url: resource.finalUrl,
  });
}
