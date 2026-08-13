import { Router } from "express";
import { listMcps, listMcpTools, doCreate, doDelete, doUpdate } from "./controller.js";

const router = Router();

router.get("/", listMcps);
router.post("/", doCreate);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);
router.get("/:id/tools", listMcpTools);

export default router;
