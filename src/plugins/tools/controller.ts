import type { Request, Response } from "express";
import type { UpdateMcpBody } from "../mcp/types.js";
import type { MemoryFact, TaskItem } from "./types.js";
import {
  listSessionFacts,
  listTasks,
  listInternalTools,
  listUserFacts,
  getSystemToolsForId,
  replaceSessionFacts,
  replaceTasks,
  replaceUserFacts,
  toggleSystemMcp,
  updateInternalToolInstruction,
  startInternalTool,
  stopInternalTool,
  updateInternalToolConfig,
} from "./service.js";

export async function listTools(_req: Request, res: Response): Promise<Response> {
  const tools = listInternalTools().map((tool) => ({
    ...tool,
    running: tool.active,
    tools: getSystemToolsForId(tool.id),
  }));
  return res.json(tools);
}

export async function doToggleTool(req: Request, res: Response): Promise<Response> {
  try {
    const { active } = req.body as { active?: boolean };
    if (typeof active !== "boolean") return res.status(400).json({ error: "active (boolean) is required" });
    return res.json(await toggleSystemMcp(req.params.id, active));
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doUpdateToolInstruction(req: Request, res: Response): Promise<Response> {
  try {
    const { instruction } = req.body as { instruction?: string };
    if (instruction === undefined) return res.status(400).json({ error: "instruction is required" });
    return res.json(await updateInternalToolInstruction(req.params.id, instruction));
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function listToolDefinitions(req: Request, res: Response): Promise<Response> {
  return res.json(getSystemToolsForId(req.params.id));
}

export async function doStartTool(req: Request, res: Response): Promise<Response> {
  try {
    await startInternalTool(req.params.id);
    return res.json({ status: "started" });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doStopTool(req: Request, res: Response): Promise<Response> {
  try {
    await stopInternalTool(req.params.id);
    return res.json({ status: "stopped" });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doUpdateTool(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as UpdateMcpBody;
    return res.json(await updateInternalToolConfig(req.params.id, body));
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function listTaskState(req: Request, res: Response): Promise<Response> {
  return res.json({ tasks: listTasks(req.params.sessionId) });
}

export async function replaceTaskState(req: Request, res: Response): Promise<Response> {
  try {
    const { tasks } = req.body as { tasks?: TaskItem[] };
    return res.json({ tasks: replaceTasks(req.params.sessionId, Array.isArray(tasks) ? tasks : []) });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
}

export async function listUserMemoryState(_req: Request, res: Response): Promise<Response> {
  return res.json({ facts: listUserFacts() });
}

export async function replaceUserMemoryState(req: Request, res: Response): Promise<Response> {
  try {
    const { facts } = req.body as { facts?: MemoryFact[] };
    return res.json({ facts: await replaceUserFacts(Array.isArray(facts) ? facts : []) });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
}

export async function listSessionMemoryState(req: Request, res: Response): Promise<Response> {
  return res.json({ facts: listSessionFacts(req.params.sessionId) });
}

export async function replaceSessionMemoryState(req: Request, res: Response): Promise<Response> {
  try {
    const { facts } = req.body as { facts?: MemoryFact[] };
    return res.json({ facts: replaceSessionFacts(req.params.sessionId, Array.isArray(facts) ? facts : []) });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
}
