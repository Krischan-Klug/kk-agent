import { Router } from "express";
import multer from "multer";
import { doCreate, doList, doGet, doDelete, doChatStream, doPatch, doGetPrompt, doRespondToPrompt, doUploadAsset, doAbort, doGetAsset, doGetAssetPreview, doDeleteAsset } from "./session-handlers.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

router.post("/", doCreate);
router.get("/", doList);
router.get("/:id", doGet);
router.delete("/:id", doDelete);
router.patch("/:id", doPatch);
router.post("/:id/assets", upload.single("file"), doUploadAsset);
router.get("/:id/assets/:assetId", doGetAsset);
router.get("/:id/assets/:assetId/preview/:page", doGetAssetPreview);
router.delete("/:id/assets/:assetId", doDeleteAsset);
router.post("/:id/chat/stream", doChatStream);
router.post("/:id/abort", doAbort);
router.get("/:id/prompt", doGetPrompt);
router.post("/:id/prompt/respond", doRespondToPrompt);

export default router;
