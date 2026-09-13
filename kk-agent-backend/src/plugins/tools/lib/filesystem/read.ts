import { readFile, stat } from "node:fs/promises";
import type { InternalToolDefinition, ToolCallResult } from "../../types.js";
import { truncateSelfBoundedReadOutput } from "../read-output.js";
import {
  detectImagePdf,
  isBinaryByExtension,
  isBlockedDevicePath,
  resolveFilesystemPath,
} from "./path-utils.js";

const READ_LINE_LIMIT = 2000;
const MAX_READ_BYTES_BEFORE_REJECT = 10 * 1024 * 1024; // 10 MB

export async function executeRead(
  config: InternalToolDefinition,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const path = await resolveFilesystemPath(config, args.file_path);

  if (isBlockedDevicePath(path)) {
    return {
      content: `Cannot read blocked device path: ${path}`,
      isError: true,
      metadata: { filePath: path, operation: "read", blocked: true },
    };
  }

  const imagePdf = detectImagePdf(path);
  if (imagePdf) {
    return {
      content: `Cannot read ${imagePdf} file as text: ${path}. Use the managed asset tools or request the file in a different way.`,
      isError: true,
      metadata: { filePath: path, operation: "read", unsupportedType: imagePdf },
    };
  }

  if (isBinaryByExtension(path)) {
    return {
      content: `Cannot read binary file: ${path}`,
      isError: true,
      metadata: { filePath: path, operation: "read", binary: true },
    };
  }

  const info = await stat(path);
  if (info.size > MAX_READ_BYTES_BEFORE_REJECT) {
    return {
      content: `File is too large to read (${info.size} bytes): ${path}. Use a more targeted approach.`,
      isError: true,
      metadata: { filePath: path, operation: "read", tooLarge: true, size: info.size },
    };
  }

  const raw = await readFile(path, "utf-8");
  const lines = raw.split("\n");
  const total = lines.length;

  const offset = typeof args.offset === "number" ? Math.max(1, Math.floor(args.offset)) : 1;
  const limit = typeof args.limit === "number" ? Math.max(1, Math.floor(args.limit)) : READ_LINE_LIMIT;

  if (offset > total) {
    return {
      content: `File has ${total} lines, but offset ${offset} is beyond the end of the file.`,
      isError: false,
      metadata: { filePath: path, operation: "read", totalLines: total, offset },
    };
  }

  const slice = lines.slice(offset - 1, offset - 1 + limit);
  const endLine = Math.min(offset - 1 + limit, total);
  const width = String(endLine).length;
  const numbered = slice.map((line, i) => `${String(offset + i).padStart(width)}\t${line}`).join("\n");
  const showingAll = offset === 1 && endLine >= total;
  const header = `${path}\n`;
  const footer = showingAll
    ? `\n[${total} lines total]`
    : `\n[Lines ${offset}-${endLine} of ${total}]\n\nWhen output is truncated, narrow the read with offset and limit.`;

  const fullOutput = header + numbered + footer;
  const truncated = truncateSelfBoundedReadOutput(fullOutput);
  const isTruncated = truncated !== fullOutput;

  return {
    content: truncated,
    isError: false,
    metadata: {
      filePath: path,
      operation: "read",
      totalLines: total,
      startLine: offset,
      endLine,
      truncated: isTruncated,
    },
  };
}
