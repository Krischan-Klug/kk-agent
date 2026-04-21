import type { Request, Response } from "express";
import {
  getModels,
  getAllModelSettings,
  setModelSettings,
  listProviders,
  addProvider,
  updateProvider,
  removeProvider,
  resolveProviderId,
  testProvider,
} from "./service.js";
import type { CreateProviderBody, ModelSettings, UpdateProviderBody } from "./types.js";

export async function listModels(req: Request, res: Response): Promise<Response> {
  try {
    const providerId = resolveProviderId(typeof req.query.providerId === "string" ? req.query.providerId : undefined);
    const models = await getModels(providerId);
    return res.json({
      models,
      providerId,
      modelSettings: getAllModelSettings(providerId),
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
}

export async function doSetModelSettings(req: Request, res: Response): Promise<Response> {
  const { providerId, settings } = req.body as { providerId?: string; settings?: ModelSettings };
  if (!providerId || !settings) {
    return res.status(400).json({ error: "providerId and settings are required" });
  }
  await setModelSettings(providerId, req.params.modelId, settings);
  return res.json({ providerId, modelId: req.params.modelId, settings });
}

export async function doListProviders(_req: Request, res: Response): Promise<Response> {
  return res.json(listProviders());
}

export async function doAddProvider(req: Request, res: Response): Promise<Response> {
  const body = req.body as CreateProviderBody;
  if (!body.name || !body.baseUrl) {
    return res.status(400).json({ error: "name and baseUrl are required" });
  }
  const provider = await addProvider(body);
  return res.status(201).json(provider);
}

export async function doUpdateProvider(req: Request, res: Response): Promise<Response> {
  try {
    const updated = await updateProvider(req.params.id, req.body as UpdateProviderBody);
    return res.json(updated);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doRemoveProvider(req: Request, res: Response): Promise<Response> {
  await removeProvider(req.params.id);
  return res.json({ deleted: true });
}

export async function doTestProvider(req: Request, res: Response): Promise<Response> {
  try {
    return res.json(await testProvider(req.params.id));
  } catch (err) {
    return res.json({ ok: false, error: (err as Error).message });
  }
}
