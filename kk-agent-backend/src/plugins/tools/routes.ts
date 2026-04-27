import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  listTools,
  doToggleTool,
  doUpdateToolInstruction,
  listToolDefinitions,
  doUpdateTool,
  listTaskState,
  replaceTaskState,
  listUserMemoryState,
  replaceUserMemoryState,
  listSessionMemoryState,
  replaceSessionMemoryState,
} from "./controller.js";

const router = Router();

router.get("/", asyncHandler(listTools));
router.get("/task/session/:sessionId", asyncHandler(listTaskState));
router.put("/task/session/:sessionId", asyncHandler(replaceTaskState));
router.get("/memory/user", asyncHandler(listUserMemoryState));
router.put("/memory/user", asyncHandler(replaceUserMemoryState));
router.get("/memory/session/:sessionId", asyncHandler(listSessionMemoryState));
router.put("/memory/session/:sessionId", asyncHandler(replaceSessionMemoryState));
router.get("/:id/tools", asyncHandler(listToolDefinitions));
router.post("/:id/toggle", asyncHandler(doToggleTool));
router.put("/:id/instruction", asyncHandler(doUpdateToolInstruction));
router.put("/:id", asyncHandler(doUpdateTool));

export default router;
