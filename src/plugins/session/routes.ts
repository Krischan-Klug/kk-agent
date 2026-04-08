import { Router } from "express";
import multer from "multer";
import { doCreate, doList, doGet, doDelete, doChat, doChatStream, doPatch, doGetPrompt, doRespondToPrompt, doUploadAttachment, doAbort } from "./controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max (per-type limits enforced in attachments.ts)
});

const router = Router();

router.post("/", doCreate);
router.get("/", doList);
router.get("/:id", doGet);
router.delete("/:id", doDelete);
router.patch("/:id", doPatch);
router.post("/:id/attachments", upload.single("file"), doUploadAttachment);
router.post("/:id/chat", doChat);
router.post("/:id/chat/stream", doChatStream);
router.post("/:id/abort", doAbort);
router.get("/:id/prompt", doGetPrompt);
router.post("/:id/prompt/respond", doRespondToPrompt);

export default router;
