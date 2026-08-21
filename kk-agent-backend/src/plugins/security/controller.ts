import type { Request, Response } from "express";
import { SecuritySettingsBodySchema } from "../../lib/schemas.js";
import { getSecuritySettings, updateSecuritySettings } from "./service.js";

export function getSettings(_req: Request, res: Response): Response {
  return res.json(getSecuritySettings());
}

export async function updateSettings(req: Request, res: Response): Promise<Response> {
  return res.json(await updateSecuritySettings(SecuritySettingsBodySchema.parse(req.body)));
}
