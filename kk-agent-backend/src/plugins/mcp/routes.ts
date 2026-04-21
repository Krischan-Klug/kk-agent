import { Router } from "express";
import { listMcps, doToggle, doUpdateInstruction, listMcpTools, doStart, doStop, doCreate, doDelete, doUpdate } from "./controller.js";

const router = Router();

router.get("/", listMcps);
router.post("/", doCreate);
router.post("/:id/toggle", doToggle);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);
router.put("/:id/instruction", doUpdateInstruction);
router.get("/:id/tools", listMcpTools);
router.post("/:id/start", doStart);
router.post("/:id/stop", doStop);

export default router;
