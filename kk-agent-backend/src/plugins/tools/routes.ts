import { Router } from "express";
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

router.get("/", listTools);
router.get("/task/session/:sessionId", listTaskState);
router.put("/task/session/:sessionId", replaceTaskState);
router.get("/memory/user", listUserMemoryState);
router.put("/memory/user", replaceUserMemoryState);
router.get("/memory/session/:sessionId", listSessionMemoryState);
router.put("/memory/session/:sessionId", replaceSessionMemoryState);
router.get("/:id/tools", listToolDefinitions);
router.post("/:id/toggle", doToggleTool);
router.put("/:id/instruction", doUpdateToolInstruction);
router.put("/:id", doUpdateTool);

export default router;
