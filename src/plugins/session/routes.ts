import { Router } from "express";
import { doCreate, doList, doGet, doDelete, doChat, doChatStream, doPatch, doGetPrompt, doRespondToPrompt } from "./controller.js";

const router = Router();

router.post("/", doCreate);
router.get("/", doList);
router.get("/:id", doGet);
router.delete("/:id", doDelete);
router.patch("/:id", doPatch);
router.post("/:id/chat", doChat);
router.post("/:id/chat/stream", doChatStream);
router.get("/:id/prompt", doGetPrompt);
router.post("/:id/prompt/respond", doRespondToPrompt);

export default router;
