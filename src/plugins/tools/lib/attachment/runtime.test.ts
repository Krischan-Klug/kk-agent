import test from "node:test";
import assert from "node:assert/strict";
import { executeAttachmentTool } from "./runtime.js";
import { attachmentDefinition } from "./definition.js";
import {
  clearSessionAttachments,
  listSessionAttachments,
} from "../../../session/lib/attachments.js";
import { runWithSessionId } from "../user-interaction/interaction-store.js";

function createSessionId() {
  return `attachment-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

test("provide_attachment stores assistant attachments in the session store and returns an attachment block", async () => {
  const sessionId = createSessionId();
  clearSessionAttachments(sessionId);

  try {
    const result = await runWithSessionId(sessionId, () =>
      executeAttachmentTool(attachmentDefinition, "provide_attachment", {
        filename: "report.md",
        mimeType: "text/markdown",
        content: "# Hello\nThis is a generated file.\n",
        encoding: "utf8",
      }),
    );

    assert.ok(result);
    assert.equal(result?.isError, false);
    assert.equal(result?.assistantBlocks?.length, 1);
    const attachmentBlock = result?.assistantBlocks?.[0];
    assert.ok(attachmentBlock && attachmentBlock.type === "attachment_ref");
    assert.equal(attachmentBlock?.filename, "report.md");
    assert.equal(attachmentBlock?.source, "assistant");

    const attachments = await listSessionAttachments(sessionId);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.filename, "report.md");
    assert.equal(attachments[0]?.source, "assistant");

    const readResult = await runWithSessionId(sessionId, () =>
      executeAttachmentTool(attachmentDefinition, "read_attachment", {
        attachmentId: attachments[0]?.id,
      }),
    );

    assert.ok(readResult);
    assert.equal(readResult?.isError, false);
    assert.match(readResult?.content ?? "", /Attachment: report\.md/);
    assert.match(readResult?.content ?? "", /Source: assistant/);
    assert.doesNotMatch(readResult?.content ?? "", /Stored path:/);
  } finally {
    clearSessionAttachments(sessionId);
  }
});

test("provide_attachment rejects unsupported file types and malformed base64", async () => {
  const sessionId = createSessionId();
  clearSessionAttachments(sessionId);

  await assert.rejects(
    () =>
      runWithSessionId(sessionId, () =>
        executeAttachmentTool(attachmentDefinition, "provide_attachment", {
          filename: "binary.exe",
          mimeType: "application/octet-stream",
          content: "SGVsbG8=",
          encoding: "base64",
        }),
      ),
    /Unsupported file type/,
  );

  await assert.rejects(
    () =>
      runWithSessionId(sessionId, () =>
        executeAttachmentTool(attachmentDefinition, "provide_attachment", {
          filename: "broken.pdf",
          mimeType: "application/pdf",
          content: "***not-base64***",
          encoding: "base64",
        }),
      ),
    /Invalid base64 content/,
  );

  clearSessionAttachments(sessionId);
});
