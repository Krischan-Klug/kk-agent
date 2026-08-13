import { Router } from "express";
import {
  doList,
  doCreate,
  doUpdate,
  doDelete,
  doListSystemVariables,
} from "./controller.js";

const router = Router();

router.get("/", doList);
router.get("/system-variables", doListSystemVariables);
router.post("/", doCreate);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);

export default router;
