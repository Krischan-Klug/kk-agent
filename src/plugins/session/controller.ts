import type { Request, Response } from "express";
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  chat,
  chatStream,
  patchSession,
  compactSession,
} from "./service.js";
import type { CreateSessionBody, ChatBody } from "./types.js";

export async function doCreate(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as CreateSessionBody;
    if (!body.agentId) return res.status(400).json({ error: "agentId is required" });
    const session = createSession(body);
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

export async function doChat(req: Request, res: Response): Promise<Response> {
  try {
    const { message } = req.body as ChatBody;
    if (!message) return res.status(400).json({ error: "message is required" });
    const result = await chat(req.params.id, message);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}

export async function doChatStream(req: Request, res: Response): Promise<void> {
  try {
    const { message } = req.body as ChatBody;
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
    });

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

export async function doPatch(req: Request, res: Response): Promise<Response> {
  try {
    const { model, activeMcpIds, reasoningEffort } = req.body as { model?: string; activeMcpIds?: string[]; reasoningEffort?: string };
    const session = patchSession(req.params.id, { model, activeMcpIds, reasoningEffort });
    return res.json(session);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doGetPrompt(req: Request, res: Response): Promise<Response> {
  try {
    const session = getSession(req.params.id);
    return res.json({ systemPrompt: session.systemPrompt });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doCompact(req: Request, res: Response): Promise<Response> {
  try {
    const { keepLast } = req.body as { keepLast?: number };
    const session = compactSession(req.params.id, keepLast);
    return res.json(session);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}
