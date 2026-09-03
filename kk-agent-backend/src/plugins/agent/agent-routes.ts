import { Router } from "express";
import {
  doList,
  doCreate,
  doUpdate,
  doDelete,
  doListSystemVariables,
  doGetTemplates,
} from "./agent-handlers.js";

const router = Router();

router.get("/", doList);
router.get("/system-variables", doListSystemVariables);
router.get("/templates", doGetTemplates);
router.post("/", doCreate);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);

export default router;
