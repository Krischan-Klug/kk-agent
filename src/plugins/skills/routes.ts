import { Router } from "express";
import { doCreate, doDelete, doList, doUpdate } from "./controller.js";

const router = Router();

router.get("/", doList);
router.post("/", doCreate);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);

export default router;
