import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/async-handler.js";
import { doCreate, doList, doGet, doDelete, doChat, doChatStream, doPatch, doGetPrompt, doRespondToPrompt, doUploadAttachment, doAbort, doGetAttachment } from "./controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max (per-type limits enforced in attachments.ts)
});

const router = Router();

router.post("/", asyncHandler(doCreate));
router.get("/", asyncHandler(doList));
router.get("/:id", asyncHandler(doGet));
router.delete("/:id", asyncHandler(doDelete));
router.patch("/:id", asyncHandler(doPatch));
router.post("/:id/attachments", upload.single("file"), asyncHandler(doUploadAttachment));
router.get("/:id/attachments/:attachmentId", asyncHandler(doGetAttachment));
router.post("/:id/chat", asyncHandler(doChat));
router.post("/:id/chat/stream", asyncHandler(doChatStream));
router.post("/:id/abort", asyncHandler(doAbort));
router.get("/:id/prompt", asyncHandler(doGetPrompt));
router.post("/:id/prompt/respond", asyncHandler(doRespondToPrompt));

export default router;
