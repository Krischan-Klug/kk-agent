import type { Request, Response } from "express";
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
import type { CreateMcpBody, UpdateMcpBody } from "./types.js";
import { getRunningMcps } from "./lib/process-manager.js";

export async function listMcps(_req: Request, res: Response): Promise<Response> {
  const mcps = await getAllMcps();
  const runningIds = getRunningMcps();
  const result = mcps.map((m) => ({
    ...m,
    running: runningIds.includes(m.id),
    tools: getMcpTools(m.id),
  }));
  return res.json(result);
}

export async function doToggle(req: Request, res: Response): Promise<Response> {
  try {
    const { active } = req.body as { active?: boolean };
    if (typeof active !== "boolean") return res.status(400).json({ error: "active (boolean) is required" });
    const mcp = await toggleMcp(req.params.id, active);
    return res.json(mcp);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doUpdateInstruction(req: Request, res: Response): Promise<Response> {
  try {
    const { instruction } = req.body as { instruction?: string };
    if (instruction === undefined) return res.status(400).json({ error: "instruction is required" });
    const mcp = await updateInstruction(req.params.id, instruction);
    return res.json(mcp);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function listMcpTools(req: Request, res: Response): Promise<Response> {
  const tools = getMcpTools(req.params.id);
  return res.json(tools);
}

export async function doStart(req: Request, res: Response): Promise<Response> {
  try {
    await startMcpServer(req.params.id);
    return res.json({ status: "started" });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doStop(req: Request, res: Response): Promise<Response> {
  try {
    await stopMcpServer(req.params.id);
    return res.json({ status: "stopped" });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doCreate(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as CreateMcpBody;
    if (!body.name || !body.transport) {
      return res.status(400).json({ error: "name and transport are required" });
    }
    const mcp = await createMcp(body);
    return res.status(201).json(mcp);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  try {
    await deleteMcp(req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doUpdate(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as UpdateMcpBody;
    const mcp = await updateMcpConfig(req.params.id, body);
    return res.json(mcp);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}
