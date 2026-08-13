import { Router } from "express";
import { listMcps, doCreate, doDelete, doUpdate } from "./controller.js";

const router = Router();

router.get("/", listMcps);
router.post("/", doCreate);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);

export default router;
