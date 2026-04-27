import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import {
  ToggleBodySchema,
  InstructionBodySchema,
  CreateMcpBodySchema,
  UpdateMcpBodySchema,
} from "../../lib/schemas.js";
import {
  getAllMcps,
  toggleMcp,
  updateInstruction,
  getMcpTools,
  startMcpServer,
  stopMcpServer,
  createMcp,
  deleteMcp,
  updateMcpConfig,
} from "./service.js";
import { getRunningMcps } from "./lib/process-manager.js";
import { removeMcpFromAgents } from "../agent/service.js";
import { removeMcpFromSessions } from "../session/lib/cleanup.js";

export async function listMcps(_req: Request, res: Response): Promise<Response> {
  const customMcps = await getAllMcps();
  const runningIds = getRunningMcps();
  const result = customMcps.map((m) => ({
    ...m,
    running: runningIds.includes(m.id),
    tools: getMcpTools(m.id),
  }));
  return res.json(result);
}

export async function doToggle(req: Request, res: Response): Promise<Response> {
  const { active } = ToggleBodySchema.parse(req.body);
  return res.json(await toggleMcp(requireParam(req, "id"), active));
}

export async function doUpdateInstruction(req: Request, res: Response): Promise<Response> {
  const { instruction } = InstructionBodySchema.parse(req.body);
  return res.json(await updateInstruction(requireParam(req, "id"), instruction));
}

export async function listMcpTools(req: Request, res: Response): Promise<Response> {
  return res.json(getMcpTools(requireParam(req, "id")));
}

export async function doStart(req: Request, res: Response): Promise<Response> {
  await startMcpServer(requireParam(req, "id"));
  return res.json({ status: "started" });
}

export async function doStop(req: Request, res: Response): Promise<Response> {
  await stopMcpServer(requireParam(req, "id"));
  return res.json({ status: "stopped" });
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
