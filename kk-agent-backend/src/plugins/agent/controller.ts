import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import {
  CreateAgentBodySchema,
  UpdateAgentBodySchema,
} from "../../lib/schemas.js";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  listSystemVariables,
} from "./service.js";

export async function doList(_req: Request, res: Response): Promise<Response> {
  return res.json(listAgents());
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
