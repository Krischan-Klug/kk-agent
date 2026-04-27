import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import {
  CreateSkillBodySchema,
  UpdateSkillBodySchema,
} from "../../lib/schemas.js";
import { removeSkillFromAgents } from "../agent/service.js";
import { removeSkillFromSessions } from "../session/lib/cleanup.js";
import { createSkill, deleteSkill, listSkills, refreshSkills, updateSkill } from "./service.js";

export async function doList(_req: Request, res: Response): Promise<Response> {
  await refreshSkills();
  return res.json(listSkills());
}

export async function doCreate(req: Request, res: Response): Promise<Response> {
  const body = CreateSkillBodySchema.parse(req.body);
  return res.status(201).json(await createSkill(body));
}

export async function doUpdate(req: Request, res: Response): Promise<Response> {
  return res.json(await updateSkill(requireParam(req, "id"), UpdateSkillBodySchema.parse(req.body)));
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  const id = requireParam(req, "id");
  await deleteSkill(id);
  await removeSkillFromAgents(id);
  await removeSkillFromSessions(id);
  return res.json({ deleted: true });
}
