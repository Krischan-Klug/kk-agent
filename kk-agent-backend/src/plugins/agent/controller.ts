import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import { NotFoundError } from "../../lib/errors.js";
import {
  CreateAgentBodySchema,
  UpdateAgentBodySchema,
} from "../../lib/schemas.js";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  listSystemVariables,
  getLoopState,
  subscribeLoopState,
} from "./service.js";

export async function doList(_req: Request, res: Response): Promise<Response> {
  return res.json(listAgents());
}

export async function doGet(req: Request, res: Response): Promise<Response> {
  return res.json(getAgent(requireParam(req, "id")));
}

export async function doListSystemVariables(_req: Request, res: Response): Promise<Response> {
  return res.json({ variables: listSystemVariables() });
}

export async function doCreate(req: Request, res: Response): Promise<Response> {
  const body = CreateAgentBodySchema.parse(req.body);
  const agent = await createAgent(body);
  return res.status(201).json(agent);
}

export async function doUpdate(req: Request, res: Response): Promise<Response> {
  const body = UpdateAgentBodySchema.parse(req.body);
  const agent = await updateAgent(requireParam(req, "id"), body);
  return res.json(agent);
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  await deleteAgent(requireParam(req, "id"));
  return res.json({ deleted: true });
}

export async function doGetLoopState(req: Request, res: Response): Promise<Response> {
  const sessionId = requireParam(req, "sessionId");
  const state = getLoopState(sessionId);
  if (!state) throw new NotFoundError("Active loop", sessionId);
  return res.json(state);
}

export async function doLoopStateStream(req: Request, res: Response): Promise<void> {
  const sessionId = requireParam(req, "sessionId");

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
