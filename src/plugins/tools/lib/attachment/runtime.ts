import type { McpServerConfig, ToolCallResult } from "../../../mcp/types.js";
import { describeAttachment, listSessionAttachments, readAttachmentData, resolveAttachmentReference } from "../../../session/lib/attachments.js";
import type { StoredAttachment } from "../../../session/lib/attachment-types.js";
import { getCurrentSessionId } from "../user-interaction/interaction-store.js";
import { truncateSelfBoundedReadOutput } from "../read-output.js";

const READ_LINE_LIMIT = 200;
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSessionIdOrThrow(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error("No active session context for attachment tool.");
  return sessionId;
}

function renderTextAttachment(attachment: StoredAttachment, rawText: string, offset: number, limit: number): string {
  const lines = rawText.split("\n");
  const total = lines.length;
  const safeOffset = Math.max(1, Math.floor(offset));
  const safeLimit = Math.max(1, Math.floor(limit));
  const slice = lines.slice(safeOffset - 1, safeOffset - 1 + safeLimit);
  const endLine = Math.min(safeOffset - 1 + safeLimit, total);
  const width = String(endLine).length;
  const numbered = slice.map((line, index) => `${String(safeOffset + index).padStart(width)}\t${line}`).join("\n");
  const footer = safeOffset === 1 && endLine >= total ? "" : `\n\n[Lines ${safeOffset}-${endLine} of ${total}]`;
  return [
    `Attachment: ${attachment.filename}`,
    `Id: ${attachment.id}`,
    `Type: ${attachment.category}`,
    `Size: ${formatSize(attachment.size)}`,
    `Stored path: ${attachment.storedPath}`,
    "",
    numbered,
    footer,
  ].join("\n");
}

export async function executeAttachmentTool(
  _config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult | null> {
  const sessionId = getSessionIdOrThrow();

  if (toolName === "list_attachments") {
    const attachments = await listSessionAttachments(sessionId);
    if (attachments.length === 0) return { content: "No chat attachments available in this session.", isError: false };
    return {
      content: attachments.map((attachment) => `${describeAttachment(attachment)}\n  storedPath: ${attachment.storedPath}`).join("\n"),
      isError: false,
    };
  }

  if (toolName === "read_attachment") {
    const attachment = await resolveAttachmentReference(sessionId, {
      attachmentId: args.attachmentId,
      filename: args.filename,
    });
    if (attachment.category === "image") {
      return {
        content: [
          `Attachment: ${attachment.filename}`,
          `Id: ${attachment.id}`,
          `Type: image`,
          `Mime: ${attachment.mimeType}`,
          `Size: ${formatSize(attachment.size)}`,
          `Stored path: ${attachment.storedPath}`,
          "",
          "Image attachments should usually be analyzed from the original chat turn via model vision rather than as text.",
        ].join("\n"),
        isError: false,
      };
    }

    const offset = typeof args.offset === "number" ? args.offset : 1;
    const limit = typeof args.limit === "number" ? args.limit : READ_LINE_LIMIT;
    const text = attachment.extractedText ?? (await readAttachmentData(attachment)).toString("utf-8");
    return { content: truncateSelfBoundedReadOutput(renderTextAttachment(attachment, text, offset, limit)), isError: false };
  }

  return null;
}
