import type { Request, Response } from "express";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getLoopState,
  subscribeLoopState,
} from "./service.js";
import type { CreateAgentBody, UpdateAgentBody } from "./types.js";

export async function doList(_req: Request, res: Response): Promise<Response> {
  return res.json(listAgents());
}

export async function doGet(req: Request, res: Response): Promise<Response> {
  try {
    return res.json(getAgent(req.params.id));
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doCreate(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as CreateAgentBody;
    if (!body.name || !body.loopStrategy || !body.promptTemplates) {
      return res.status(400).json({ error: "name, loopStrategy and promptTemplates are required" });
    }
    const agent = await createAgent(body);
    return res.status(201).json(agent);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
}

export async function doUpdate(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as UpdateAgentBody;
    const agent = await updateAgent(req.params.id, body);
    return res.json(agent);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  try {
    await deleteAgent(req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doGetLoopState(req: Request, res: Response): Promise<Response> {
  const state = getLoopState(req.params.sessionId);
  if (!state) return res.status(404).json({ error: "No active loop for this session" });
  return res.json(state);
}

export async function doLoopStateStream(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send current state immediately if exists
  const current = getLoopState(sessionId);
  if (current) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
  }

  const unsubscribe = subscribeLoopState(sessionId, (state) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
}
