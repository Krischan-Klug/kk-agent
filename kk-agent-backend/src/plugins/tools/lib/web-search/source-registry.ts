import { createHash } from "node:crypto";
import type { ToolRuntimeContext } from "../../../loop/types.js";
import type { WebSourceRecord } from "./types.js";

const WEB_SOURCES_KEY = "webSources";
const MAX_SOURCES_PER_RUN = 200;

function canonicalUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/iu.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return input;
  }
}

export function sourceIdForUrl(url: string): string {
  return `src_${createHash("sha256").update(canonicalUrl(url)).digest("hex").slice(0, 12)}`;
}

function isWebSourceRecord(value: unknown): value is WebSourceRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WebSourceRecord>;
  return typeof record.id === "string" && typeof record.url === "string" && typeof record.title === "string";
}

function readWebSources(context?: ToolRuntimeContext): WebSourceRecord[] {
  const value = context?.values[WEB_SOURCES_KEY];
  return Array.isArray(value) ? value.filter(isWebSourceRecord) : [];
}

export function resolveRegisteredSource(context: ToolRuntimeContext | undefined, sourceId: string): WebSourceRecord | undefined {
  return readWebSources(context).find((source) => source.id === sourceId);
}

export function mergeWebSources(context: ToolRuntimeContext, sources: WebSourceRecord[]): ToolRuntimeContext {
  const merged = new Map(readWebSources(context).map((source) => [source.id, source]));
  for (const source of sources) {
    const current = merged.get(source.id);
    merged.set(source.id, current ? { ...current, ...source } : source);
  }
  const values = [...merged.values()].slice(-MAX_SOURCES_PER_RUN);
  return { ...context, values: { ...context.values, [WEB_SOURCES_KEY]: values } };
}

export function withWebSources(sources: WebSourceRecord[]): (context: ToolRuntimeContext) => ToolRuntimeContext {
  return (context) => mergeWebSources(context, sources);
}

export function normalizedSourceUrl(url: string): string {
  return canonicalUrl(url);
}
