import { Router } from "express";
import {
  doList,
  doGet,
  doCreate,
  doUpdate,
  doDelete,
  doListSystemVariables,
  doGetLoopState,
  doLoopStateStream,
} from "./controller.js";

const router = Router();

router.get("/", doList);
router.get("/system-variables", doListSystemVariables);
router.post("/", doCreate);
router.get("/:id", doGet);
router.put("/:id", doUpdate);
router.delete("/:id", doDelete);

// Loop state endpoints
router.get("/loop-state/:sessionId", doGetLoopState);
router.get("/loop-state/:sessionId/stream", doLoopStateStream);

export default router;
