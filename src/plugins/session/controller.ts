import type { Request, Response } from "express";
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  chat,
  chatStream,
  abortSessionLoop,
  patchSession,
  getCurrentPromptDebug,
} from "./service.js";
import type { CreateSessionBody, ChatBody, UpdateSessionBody } from "./types.js";
import { resolvePrompt } from "../tools/lib/user-interaction/interaction-store.js";
import { getSessionAttachmentById, readAttachmentData, storeAttachment } from "./lib/attachments.js";

export async function doCreate(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as CreateSessionBody;
    if (!body.agentId) return res.status(400).json({ error: "agentId is required" });
    const session = await createSession(body);
    return res.status(201).json(session);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
}

export async function doList(_req: Request, res: Response): Promise<Response> {
  return res.json(listSessions());
}

export async function doGet(req: Request, res: Response): Promise<Response> {
  try {
    const session = getSession(req.params.id);
    return res.json(session);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  try {
    deleteSession(req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doUploadAttachment(req: Request, res: Response): Promise<Response> {
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    // Validate session exists
    getSession(req.params.id);

    const meta = await storeAttachment(req.params.id, file, { source: "user" });
    return res.status(201).json(meta);
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not found") ? 404 : message.includes("Unsupported") || message.includes("too large") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}

export async function doGetAttachment(req: Request, res: Response): Promise<Response> {
  try {
    getSession(req.params.id);
    const attachment = await getSessionAttachmentById(req.params.id, req.params.attachmentId);
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });

    const data = await readAttachmentData(attachment);
    res.attachment(attachment.filename);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Length", String(data.length));
    return res.status(200).send(data);
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not found") ? 404 : 500;
    return res.status(status).json({ error: message });
  }
}

export async function doChat(req: Request, res: Response): Promise<Response> {
  try {
    const { message, attachmentIds } = req.body as ChatBody;
    if (!message) return res.status(400).json({ error: "message is required" });
    const result = await chat(req.params.id, message, attachmentIds);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}

export async function doChatStream(req: Request, res: Response): Promise<void> {
  try {
    const { message, attachmentIds } = req.body as ChatBody;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    await chatStream(req.params.id, message, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }, attachmentIds);

    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: (err as Error).message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: (err as Error).message })}\n\n`);
      res.end();
    }
  }
}

export async function doAbort(req: Request, res: Response): Promise<Response> {
  const ok = abortSessionLoop(req.params.id);
  if (!ok) return res.status(404).json({ error: "No active loop for this session" });
  return res.json({ ok: true });
}

export async function doPatch(req: Request, res: Response): Promise<Response> {
  try {
    const {
      agentId,
      providerId,
      activeMode,
      model,
      activeToolIds,
      activeMcpIds,
      activeSkillIds,
      llmRequestConfig,
    } = req.body as UpdateSessionBody;
    const session = await patchSession(req.params.id, {
      agentId,
      providerId,
      activeMode,
      model,
      activeToolIds,
      activeMcpIds,
      activeSkillIds,
      llmRequestConfig,
    });
    return res.json(session);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doRespondToPrompt(req: Request, res: Response): Promise<Response> {
  try {
    const sessionId = req.params.id;
    const { promptId, selectedKey } = req.body as { promptId: string; selectedKey: string };
    if (!promptId || !selectedKey) {
      return res.status(400).json({ error: "promptId and selectedKey are required" });
    }
    const resolved = resolvePrompt(sessionId, promptId, selectedKey);
    if (!resolved) {
      return res.status(404).json({ error: "No pending prompt found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}

export async function doGetPrompt(req: Request, res: Response): Promise<Response> {
  try {
    return res.json(getCurrentPromptDebug(req.params.id));
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}
