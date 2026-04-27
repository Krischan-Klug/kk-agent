import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { listMcps, doToggle, doUpdateInstruction, listMcpTools, doStart, doStop, doCreate, doDelete, doUpdate } from "./controller.js";

const router = Router();

router.get("/", asyncHandler(listMcps));
router.post("/", asyncHandler(doCreate));
router.post("/:id/toggle", asyncHandler(doToggle));
router.put("/:id", asyncHandler(doUpdate));
router.delete("/:id", asyncHandler(doDelete));
router.put("/:id/instruction", asyncHandler(doUpdateInstruction));
router.get("/:id/tools", asyncHandler(listMcpTools));
router.post("/:id/start", asyncHandler(doStart));
router.post("/:id/stop", asyncHandler(doStop));

export default router;
