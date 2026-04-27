import type { Request, Response } from "express";
import { getErrorMessage } from "../../lib/error.js";
import { NotFoundError } from "../../lib/errors.js";
import { requireParam } from "../../lib/http.js";
import {
  ChatBodySchema,
  CreateSessionBodySchema,
  UpdateSessionBodySchema,
  PromptResponseBodySchema,
} from "../../lib/schemas.js";
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  patchSession,
  getCurrentPromptDebug,
} from "./service.js";
import { abortSessionLoop, chat, chatStream } from "./lib/chat-engine.js";
import { resolvePrompt } from "../tools/lib/user-interaction/interaction-store.js";
import { getSessionAttachmentById, readAttachmentData, storeAttachment } from "./lib/attachments.js";

export async function doCreate(req: Request, res: Response): Promise<Response> {
  const body = CreateSessionBodySchema.parse(req.body);
  const session = await createSession(body);
  return res.status(201).json(session);
}

export async function doList(_req: Request, res: Response): Promise<Response> {
  return res.json(listSessions());
}

export async function doGet(req: Request, res: Response): Promise<Response> {
  const session = getSession(requireParam(req, "id"));
  return res.json(session);
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  await deleteSession(requireParam(req, "id"));
  return res.json({ deleted: true });
}

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export async function doUploadAttachment(req: Request, res: Response): Promise<Response> {
  const file = (req as MulterRequest).file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  // Validate session exists
  const sessionId = requireParam(req, "id");
  getSession(sessionId);

  const meta = await storeAttachment(sessionId, file, { source: "user" });
  return res.status(201).json(meta);
}

export async function doGetAttachment(req: Request, res: Response): Promise<Response> {
  const sessionId = requireParam(req, "id");
  const attachmentId = requireParam(req, "attachmentId");
  getSession(sessionId);
  const attachment = await getSessionAttachmentById(sessionId, attachmentId);
  if (!attachment) throw new NotFoundError("Attachment", attachmentId);

  const data = await readAttachmentData(attachment);
  res.attachment(attachment.filename);
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Length", String(data.length));
  return res.status(200).send(data);
}

export async function doChat(req: Request, res: Response): Promise<Response> {
  const { message, attachmentIds } = ChatBodySchema.parse(req.body);
  const result = await chat(requireParam(req, "id"), message, attachmentIds);
  return res.json(result);
}

export async function doChatStream(req: Request, res: Response): Promise<void> {
  const sessionId = requireParam(req, "id");
  const { message, attachmentIds } = ChatBodySchema.parse(req.body);

  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    await chatStream(sessionId, message, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }, attachmentIds);

    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: getErrorMessage(err) });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: getErrorMessage(err) })}\n\n`);
      res.end();
    }
  }
}

export async function doAbort(req: Request, res: Response): Promise<Response> {
  const id = requireParam(req, "id");
  const ok = abortSessionLoop(id);
  if (!ok) throw new NotFoundError("Active loop", id);
  return res.json({ ok: true });
}

export async function doPatch(req: Request, res: Response): Promise<Response> {
  const body = UpdateSessionBodySchema.parse(req.body);
  const session = await patchSession(requireParam(req, "id"), body);
  return res.json(session);
}

export async function doRespondToPrompt(req: Request, res: Response): Promise<Response> {
  const sessionId = requireParam(req, "id");
  const { promptId, selectedKey } = PromptResponseBodySchema.parse(req.body);
  const resolved = resolvePrompt(sessionId, promptId, selectedKey);
  if (!resolved) {
    throw new NotFoundError("Pending prompt", promptId);
  }
  return res.json({ ok: true });
}

export async function doGetPrompt(req: Request, res: Response): Promise<Response> {
  return res.json(getCurrentPromptDebug(requireParam(req, "id")));
}
