import type { Request, Response } from "express";
import { requireParam } from "../../lib/http.js";
import {
  ModelSettingsBodySchema,
  CreateProviderBodySchema,
  UpdateProviderBodySchema,
} from "../../lib/schemas.js";
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

export async function listModels(req: Request, res: Response): Promise<Response> {
  const providerId = resolveProviderId(typeof req.query.providerId === "string" ? req.query.providerId : undefined);
  const models = await getModels(providerId);
  return res.json({
    models,
    providerId,
    modelSettings: getAllModelSettings(providerId),
  });
}

export async function doSetModelSettings(req: Request, res: Response): Promise<Response> {
  const { providerId, settings } = ModelSettingsBodySchema.parse(req.body);
  const modelId = requireParam(req, "modelId");
  await setModelSettings(providerId, modelId, settings);
  return res.json({ providerId, modelId, settings });
}

export async function doListProviders(_req: Request, res: Response): Promise<Response> {
  return res.json(listProviders());
}

export async function doAddProvider(req: Request, res: Response): Promise<Response> {
  const body = CreateProviderBodySchema.parse(req.body);
  const provider = await addProvider(body);
  return res.status(201).json(provider);
}

export async function doUpdateProvider(req: Request, res: Response): Promise<Response> {
  const updated = await updateProvider(requireParam(req, "id"), UpdateProviderBodySchema.parse(req.body));
  return res.json(updated);
}

export async function doRemoveProvider(req: Request, res: Response): Promise<Response> {
  await removeProvider(requireParam(req, "id"));
  return res.json({ deleted: true });
}

export async function doTestProvider(req: Request, res: Response): Promise<Response> {
  return res.json(await testProvider(requireParam(req, "id")));
}
