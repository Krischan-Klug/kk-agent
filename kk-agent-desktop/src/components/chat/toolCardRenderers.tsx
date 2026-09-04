import type { MouseEvent, ReactNode } from "react";
import {
  ToolDetailLine,
  ToolDetailLink,
  ToolDetailMuted,
  ToolDetailPre,
  ToolDetailSection,
} from "./ChatMessages.styled";
import type { ActiveToolCall } from "./types";

function openExternal(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  event.preventDefault();
  if (!/^https?:\/\//iu.test(url)) return;
  if (window.kkAgentDesktop?.external) {
    void window.kkAgentDesktop.external.open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function formatLineRange(meta: Record<string, unknown>): string {
  const start = meta.startLine;
  const end = meta.endLine;
  const total = meta.totalLines;
  if (typeof start === "number" && typeof end === "number") {
    const range = start === end ? `line ${start}` : `lines ${start}-${end}`;
    if (typeof total === "number") return `${range} of ${total}`;
    return range;
  }
  return "";
}

export function getToolCardMetadataSummary(toolCall: ActiveToolCall): string | undefined {
  const meta = toolCall.metadata;
  const name = toolCall.name;

  if (name === "Read" && meta) {
    const path = String(meta.filePath ?? "");
    const range = formatLineRange(meta);
    const truncated = meta.truncated === true ? " (truncated)" : "";
    return path ? `Read ${path}${range ? ` - ${range}` : ""}${truncated}` : undefined;
  }

  if (name === "Edit" && meta) {
    const path = String(meta.filePath ?? "");
    const occurrences = meta.occurrences;
    const changed = meta.changedLines;
    const parts: string[] = [];
    if (path) parts.push(path);
    if (typeof occurrences === "number") parts.push(`${occurrences} replacement(s)`);
    if (typeof changed === "number") parts.push(`${changed} line(s) changed`);
    return parts.length > 0 ? parts.join(" - ") : undefined;
  }

  if (name === "Write" && meta) {
    const path = String(meta.filePath ?? "");
    const op = String(meta.operation ?? "");
    const changed = meta.changedLines;
    const parts: string[] = [];
    if (path) parts.push(path);
    if (op) parts.push(op);
    if (typeof changed === "number") parts.push(`${changed} line(s) changed`);
    return parts.length > 0 ? parts.join(" - ") : undefined;
  }

  if (name === "Glob" && meta) {
    const pattern = String(meta.pattern ?? "");
    const num = meta.numFiles;
    const truncated = meta.truncated === true ? " (truncated)" : "";
    return pattern ? `Glob ${pattern} - ${typeof num === "number" ? num : 0} file(s)${truncated}` : undefined;
  }

  if (name === "Grep" && meta) {
    const pattern = String(meta.pattern ?? "");
    const count = meta.count ?? meta.totalMatches ?? meta.numFiles;
    return pattern ? `Grep "${pattern}" - ${typeof count === "number" ? count : 0} match(es)` : undefined;
  }

  if (name === "WebSearch" && meta) {
    const query = String(meta.query ?? "");
    const count = meta.sourceCount;
    const cached = meta.cachedQueries;
    const cacheSuffix = typeof cached === "number" && cached > 0 ? ` - ${cached} cached` : "";
    return query ? `Search "${query}" - ${typeof count === "number" ? count : 0} result(s)${cacheSuffix}` : undefined;
  }

  if ((name === "WebFetch" || name === "WebOpen") && meta) {
    const url = String(meta.finalUrl ?? meta.url ?? "");
    const range = formatLineRange(meta);
    return url ? `${name === "WebFetch" ? "Fetch" : "Open"} ${url}${range ? ` - ${range}` : ""}` : undefined;
  }

  if (name === "WebFind" && meta) {
    const pattern = String(meta.pattern ?? "");
    const count = meta.matchCount;
    return pattern ? `Find "${pattern}" - ${typeof count === "number" ? count : 0} match(es)` : undefined;
  }

  if (name === "Terminal" && meta) {
    const cwd = String(meta.cwd ?? "");
    const version = String(meta.shellVersion ?? "");
    const privilege = meta.privilege === "current_user" ? "current user" : "";
    return [cwd, version && `version ${version}`, privilege].filter(Boolean).join(" - ") || undefined;
  }

  return undefined;
}

export function renderToolCardBody(toolCall: ActiveToolCall): ReactNode {
  const meta = toolCall.metadata;
  const name = toolCall.name;
  const nodes: ReactNode[] = [];

  if ((name === "Edit" || name === "Write") && meta) {
    const diff = typeof meta.diff === "string" ? meta.diff : "";
    if (diff) {
      nodes.push(<ToolDetailPre key="diff">{diff}</ToolDetailPre>);
    }
  }

  if (name.startsWith("Web") && meta) {
    if (name === "WebSearch" && Array.isArray(meta.providerTrace)) {
      nodes.push(
        <ToolDetailSection key="provider-trace">
          <ToolDetailMuted>Search provenance:</ToolDetailMuted>
          {meta.providerTrace.map((rawEntry: unknown, index: number) => {
            const entry = rawEntry as Record<string, unknown>;
            const query = typeof entry.query === "string" ? entry.query : "query";
            const cached = entry.cached === true;
            const trace = Array.isArray(entry.trace) ? entry.trace : [];
            const summary = trace.map((rawStep: unknown) => {
              const step = rawStep as Record<string, unknown>;
              const provider = typeof step.provider === "string" ? step.provider : "unknown";
              const status = typeof step.status === "string" ? step.status : "unknown";
              const refined = step.refined === true && typeof step.executedQuery === "string"
                ? `; refined as ${step.executedQuery}`
                : "";
              return `${provider}: ${status}${refined}`;
            }).join(" → ");
            return <ToolDetailLine key={`${query}-${index}`}>- {query} ({cached ? "cache hit" : "cache miss"}): {summary}</ToolDetailLine>;
          })}
        </ToolDetailSection>,
      );
    }
    const results = Array.isArray(meta.sources)
      ? meta.sources
      : Array.isArray(meta.results)
        ? meta.results
        : [];
    if (results.length > 0) {
      nodes.push(
        <ToolDetailSection key="sources">
          <ToolDetailMuted>Sources:</ToolDetailMuted>
          {results.map((r: unknown, i: number) => {
            const result = r as Record<string, unknown>;
            const title = typeof result.title === "string" ? result.title : "Untitled";
            const host = typeof result.host === "string" ? result.host : "";
            const url = typeof result.url === "string" ? result.url : "";
            const id = typeof result.id === "string" ? result.id : "";
            const provider = typeof result.provider === "string" ? result.provider : "";
            return (
              <ToolDetailLine key={`${id}-${i}`}>
                - {url ? (
                  <ToolDetailLink href={url} onClick={(event) => openExternal(event, url)}>
                    {title}
                  </ToolDetailLink>
                ) : title} {host ? `(${host})` : ""} {provider ? `via ${provider}` : ""} {id ? `[${id}]` : ""}
              </ToolDetailLine>
            );
          })}
        </ToolDetailSection>,
      );
    }
  }

  return nodes.length > 0 ? <>{nodes}</> : null;
}
