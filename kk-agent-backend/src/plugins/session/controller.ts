import type { Request, Response } from "express";
import { getErrorMessage } from "../../lib/error.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { isLoopActive } from "../loop/lib/run-registry.js";
import { requireParam } from "../../lib/http.js";
import {
  ChatBodySchema,
  CreateSessionBodySchema,
  UpdateSessionBodySchema,
  PromptResponseBodySchema,
} from "../../lib/schemas.js";
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  patchSession,
  getCurrentPromptDebug,
} from "./service.js";
import { abortSessionLoop, chatStream } from "./lib/chat-engine.js";
import { resolvePrompt } from "../tools/lib/user-interaction/interaction-store.js";
import { deleteUnreferencedAsset, getSessionAssetById, ingestAsset, readAssetData, readAssetPreview } from "./lib/assets.js";

export async function doCreate(req: Request, res: Response): Promise<Response> {
  const body = CreateSessionBodySchema.parse(req.body);
  const session = await createSession(body);
  return res.status(201).json(session);
}

export async function doList(_req: Request, res: Response): Promise<Response> {
  return res.json(listSessions());
}

export async function doGet(req: Request, res: Response): Promise<Response> {
  const session = getSession(requireParam(req, "id"));
  return res.json(session);
}

export async function doDelete(req: Request, res: Response): Promise<Response> {
  await deleteSession(requireParam(req, "id"));
  return res.json({ deleted: true });
}

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export async function doUploadAsset(req: Request, res: Response): Promise<Response> {
  const file = (req as MulterRequest).file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const sessionId = requireParam(req, "id");
  getSession(sessionId);
  if (isLoopActive(sessionId)) throw new ConflictError("Assets cannot be uploaded while a run is active.");

  const meta = await ingestAsset(sessionId, {
      filename: file.originalname,
      declaredMimeType: file.mimetype,
      buffer: file.buffer,
      source: "user",
    }).catch((error: unknown) => { throw new ValidationError(getErrorMessage(error)); });
  return res.status(201).json(meta);
}

export async function doGetAsset(req: Request, res: Response): Promise<Response> {
  const sessionId = requireParam(req, "id");
  const assetId = requireParam(req, "assetId");
  getSession(sessionId);
  const asset = getSessionAssetById(sessionId, assetId);
  if (!asset) throw new NotFoundError("Asset", assetId);

  const data = await readAssetData(sessionId, assetId);
  res.attachment(asset.filename);
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", String(data.length));
  return res.status(200).send(data);
}

export async function doGetAssetPreview(req: Request, res: Response): Promise<Response> {
  const sessionId = requireParam(req, "id");
  const assetId = requireParam(req, "assetId");
  const page = Number.parseInt(requireParam(req, "page"), 10);
  if (!Number.isInteger(page) || page < 1) return res.status(400).json({ error: "Invalid preview page" });
  getSession(sessionId);
  if (!getSessionAssetById(sessionId, assetId)) throw new NotFoundError("Asset", assetId);
  const preview = await readAssetPreview(sessionId, assetId, page);
  res.setHeader("Content-Type", preview.mimeType);
  res.setHeader("Content-Length", String(preview.data.length));
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.status(200).send(preview.data);
}

export async function doDeleteAsset(req: Request, res: Response): Promise<Response> {
  const sessionId = requireParam(req, "id");
  const assetId = requireParam(req, "assetId");
  getSession(sessionId);
  if (isLoopActive(sessionId)) throw new ConflictError("Assets cannot be deleted while a run is active.");
  const deleted = await deleteUnreferencedAsset(sessionId, assetId);
  if (!deleted) throw new NotFoundError("Asset", assetId);
  return res.json({ deleted: true });
}

export async function doChatStream(req: Request, res: Response): Promise<void> {
  const sessionId = requireParam(req, "id");
  const { message, assetIds } = ChatBodySchema.parse(req.body);
  const startStream = () => {
    if (res.headersSent) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  };
  const abortOnDisconnect = () => {
    if (!res.writableEnded) abortSessionLoop(sessionId);
  };
  res.once("close", abortOnDisconnect);

  try {
    await chatStream(sessionId, message, (event) => {
      startStream();
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }, assetIds);

    startStream();
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      throw err;
    } else {
      res.write(`data: ${JSON.stringify({ type: "transport_error", message: getErrorMessage(err) })}\n\n`);
      res.end();
    }
  } finally {
    res.off("close", abortOnDisconnect);
  }
}

export async function doAbort(req: Request, res: Response): Promise<Response> {
  const id = requireParam(req, "id");
  const ok = abortSessionLoop(id);
  if (!ok) throw new NotFoundError("Active loop", id);
  return res.json({ ok: true });
}

export async function doPatch(req: Request, res: Response): Promise<Response> {
  const body = UpdateSessionBodySchema.parse(req.body);
  const session = await patchSession(requireParam(req, "id"), body);
  return res.json(session);
}

export async function doRespondToPrompt(req: Request, res: Response): Promise<Response> {
  const sessionId = requireParam(req, "id");
  const { promptId, selectedKey } = PromptResponseBodySchema.parse(req.body);
  const resolved = resolvePrompt(sessionId, promptId, selectedKey);
  if (!resolved) {
    throw new NotFoundError("Pending prompt", promptId);
  }
  return res.json({ ok: true });
}

export async function doGetPrompt(req: Request, res: Response): Promise<Response> {
  return res.json(getCurrentPromptDebug(requireParam(req, "id")));
}
