import { Router } from "express";
import {
  doList,
  doGet,
  doCreate,
  doUpdate,
  doDelete,
  doListSystemVariables,
} from "./controller.js";

const router = Router();

router.get("/", doList);
router.get("/system-variables", doListSystemVariables);
router.post("/", doCreate);
router.get("/:id", doGet);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);

export default router;
