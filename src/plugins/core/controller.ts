import type { Request, Response } from "express";
import { getCoreData } from "./service.js";

export async function getCore(_req: Request, res: Response): Promise<Response> {
  const result = await getCoreData();
  return res.json(result);
}
