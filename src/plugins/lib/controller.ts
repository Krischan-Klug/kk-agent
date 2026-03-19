import type { Request, Response } from "express";
import { getLibData } from "./service.js";

export async function getLib(_req: Request, res: Response): Promise<Response> {
  const result = await getLibData();
  return res.json(result);
}
