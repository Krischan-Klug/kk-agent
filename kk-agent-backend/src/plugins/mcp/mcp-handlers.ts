import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import {
  CreateMcpBodySchema,
  UpdateMcpBodySchema,
} from "../../lib/schemas.js";
import {
  getAllMcps,
  getMcpTools,
  createMcp,
  deleteMcp,
  updateMcpConfig,
} from "./service.js";
import { getMcpRuntimeState } from "./lib/process-manager.js";
import { buildCredentialStatuses } from "./lib/credentials.js";
import { removeMcpFromAgents } from "../agent/service.js";
import { removeMcpFromSessions } from "../session/lib/cleanup.js";

export async function listMcps(_req: Request, res: Response): Promise<Response> {
  const customMcps = await getAllMcps();
  const result = customMcps.map((m) => ({
    ...m,
    runtime: getMcpRuntimeState(m.id),
    tools: getMcpTools(m.id),
    credentials: buildCredentialStatuses(m.credentialBindings),
  }));
  return res.json(result);
}

export async function doCreate(req: Request, res: Response): Promise<Response> {
  const body = CreateMcpBodySchema.parse(req.body);
  const mcp = await createMcp(body);
  return res.status(201).json(mcp);
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  const id = requireParam(req, "id");
  await deleteMcp(id);
  await removeMcpFromAgents(id);
  await removeMcpFromSessions(id);
  return res.json({ deleted: true });
}

export async function doUpdate(req: Request, res: Response): Promise<Response> {
  const body = UpdateMcpBodySchema.parse(req.body);
  return res.json(await updateMcpConfig(requireParam(req, "id"), body));
}
