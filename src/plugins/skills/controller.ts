import type { Request, Response } from "express";
import { removeSkillFromAgents } from "../agent/service.js";
import { removeSkillFromSessions } from "../session/service.js";
import { createSkill, deleteSkill, listSkills, refreshSkills, updateSkill } from "./service.js";
import type { CreateSkillBody, UpdateSkillBody } from "./types.js";

export async function doList(_req: Request, res: Response): Promise<Response> {
  await refreshSkills();
  return res.json(listSkills());
}

export async function doCreate(req: Request, res: Response): Promise<Response> {
  try {
    const body = req.body as CreateSkillBody;
    if (!body.name || !body.description || !body.instruction) {
      return res.status(400).json({ error: "name, description and instruction are required" });
    }
    return res.status(201).json(await createSkill(body));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
}

export async function doUpdate(req: Request, res: Response): Promise<Response> {
  try {
    return res.json(await updateSkill(req.params.id, req.body as UpdateSkillBody));
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  try {
    await deleteSkill(req.params.id);
    await removeSkillFromAgents(req.params.id);
    removeSkillFromSessions(req.params.id);
    return res.json({ deleted: true });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
}
