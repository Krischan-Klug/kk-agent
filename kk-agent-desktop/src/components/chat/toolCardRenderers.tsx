import type { ReactNode } from "react";
import { ToolDetailPre } from "./ChatMessages.styled";
import type { ActiveToolCall } from "./types";

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

  return nodes.length > 0 ? <>{nodes}</> : null;
}
