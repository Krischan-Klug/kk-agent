import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import { ValidationError } from "../../lib/errors.js";
import { removeSkillFromAgents } from "../agent/service.js";
import { removeSkillFromSessions } from "../session/lib/cleanup.js";
import { deleteSkill, importSkill, listSkills, refreshSkills } from "./service.js";

function toPathList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") return [value];
  return [];
}

export async function doList(_req: Request, res: Response): Promise<Response> {
  await refreshSkills();
  return res.json(listSkills());
}

export async function doImport(req: Request, res: Response): Promise<Response> {
  const files = req.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new ValidationError("No skill files uploaded.");
  }

  const paths = toPathList(req.body.paths);
  const imported = await importSkill(files.map((file, index) => ({
    path: paths[index] || file.originalname,
    content: file.buffer,
  })));
  return res.status(201).json(imported);
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  const id = requireParam(req, "id");
  await deleteSkill(id);
  await removeSkillFromAgents(id);
  await removeSkillFromSessions(id);
  return res.json({ deleted: true });
}
