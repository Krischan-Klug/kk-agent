import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import {
  UpdateMcpBodySchema,
  TaskItemsBodySchema,
  MemoryFactsBodySchema,
} from "../../lib/schemas.js";
import {
  listSessionFacts,
  listTasks,
  getAllSystemMcps,
  getSystemMcpRuntimeState,
  listUserFacts,
  replaceSessionFacts,
  replaceTasks,
  replaceUserFacts,
  updateInternalToolConfig,
} from "./service.js";
import { getSystemToolsForMcp } from "./lib/index.js";

export async function listTools(_req: Request, res: Response): Promise<Response> {
  const tools = getAllSystemMcps().map((tool) => ({
    ...tool,
    runtime: getSystemMcpRuntimeState(tool),
    tools: getSystemToolsForMcp(tool.id),
  }));
  return res.json(tools);
}

export async function doUpdateTool(req: Request, res: Response): Promise<Response> {
  const body = UpdateMcpBodySchema.parse(req.body);
  return res.json(await updateInternalToolConfig(requireParam(req, "id"), body));
}

export async function listTaskState(req: Request, res: Response): Promise<Response> {
  return res.json({ tasks: listTasks(requireParam(req, "sessionId")) });
}

export async function replaceTaskState(req: Request, res: Response): Promise<Response> {
  const { tasks } = TaskItemsBodySchema.parse(req.body);
  return res.json({ tasks: await replaceTasks(requireParam(req, "sessionId"), tasks ?? []) });
}

export async function listUserMemoryState(_req: Request, res: Response): Promise<Response> {
  return res.json({ facts: listUserFacts() });
}

export async function replaceUserMemoryState(req: Request, res: Response): Promise<Response> {
  const { facts } = MemoryFactsBodySchema.parse(req.body);
  return res.json({ facts: await replaceUserFacts(facts ?? []) });
}

export async function listSessionMemoryState(req: Request, res: Response): Promise<Response> {
  return res.json({ facts: listSessionFacts(requireParam(req, "sessionId")) });
}

export async function replaceSessionMemoryState(req: Request, res: Response): Promise<Response> {
  const { facts } = MemoryFactsBodySchema.parse(req.body);
  return res.json({ facts: await replaceSessionFacts(requireParam(req, "sessionId"), facts ?? []) });
}
