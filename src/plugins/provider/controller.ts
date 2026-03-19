import type { Request, Response } from "express";
import { getModels, switchModel, getActiveModel, getAllModelSettings, setModelSettings } from "./service.js";
import type { ModelSettings } from "./types.js";

export async function listModels(_req: Request, res: Response): Promise<Response> {
  const models = await getModels();
  return res.json({ models, activeModel: getActiveModel(), modelSettings: getAllModelSettings() });
}

export async function doGetModelSettings(_req: Request, res: Response): Promise<Response> {
  return res.json(getAllModelSettings());
}

export async function doSetModelSettings(req: Request, res: Response): Promise<Response> {
  const modelId = req.params.modelId;
  const settings = req.body as ModelSettings;
  await setModelSettings(modelId, settings);
  return res.json({ modelId, settings });
}

export async function doSwitchModel(req: Request, res: Response): Promise<Response> {
  const { model } = req.body as { model?: string };
  if (!model) return res.status(400).json({ error: "model is required" });
  await switchModel(model);
  return res.json({ activeModel: getActiveModel() });
}
