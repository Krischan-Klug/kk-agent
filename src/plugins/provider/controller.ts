import type { Request, Response } from "express";
import {
  getModels,
  switchModel,
  getActiveModel,
  getActiveProviderId,
  getAllModelSettings,
  setModelSettings,
  listProviders,
  addProvider,
  updateProvider,
  removeProvider,
  setActiveProvider,
  testProvider,
} from "./service.js";
import type { ModelSettings, ProviderConfig } from "./types.js";

/* ── Model endpoints (unchanged) ── */

export async function listModels(_req: Request, res: Response): Promise<Response> {
  const models = await getModels();
  return res.json({
    models,
    activeModel: getActiveModel(),
    activeProviderId: getActiveProviderId(),
    modelSettings: getAllModelSettings(),
  });
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

/* ── Provider CRUD ── */

export async function doListProviders(_req: Request, res: Response): Promise<Response> {
  return res.json(listProviders());
}

export async function doAddProvider(req: Request, res: Response): Promise<Response> {
  const body = req.body as Omit<ProviderConfig, "id">;
  if (!body.name || !body.type) {
    return res.status(400).json({ error: "name and type are required" });
  }
  const provider = await addProvider(body);
  return res.status(201).json(provider);
}

export async function doUpdateProvider(req: Request, res: Response): Promise<Response> {
  try {
    const updated = await updateProvider(req.params.id, req.body);
    return res.json(updated);
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doRemoveProvider(req: Request, res: Response): Promise<Response> {
  await removeProvider(req.params.id);
  return res.json({ deleted: true });
}

export async function doActivateProvider(req: Request, res: Response): Promise<Response> {
  try {
    await setActiveProvider(req.params.id);
    return res.json({ activeProviderId: getActiveProviderId() });
  } catch (err) {
    return res.status(404).json({ error: (err as Error).message });
  }
}

export async function doTestProvider(req: Request, res: Response): Promise<Response> {
  try {
    const result = await testProvider(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.json({ ok: false, error: (err as Error).message });
  }
}
