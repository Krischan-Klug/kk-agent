import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
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

router.get("/", asyncHandler(doList));
router.get("/system-variables", asyncHandler(doListSystemVariables));
router.post("/", asyncHandler(doCreate));
router.get("/:id", asyncHandler(doGet));
router.put("/:id", asyncHandler(doUpdate));
router.delete("/:id", asyncHandler(doDelete));

// Loop state endpoints
router.get("/loop-state/:sessionId", asyncHandler(doGetLoopState));
router.get("/loop-state/:sessionId/stream", asyncHandler(doLoopStateStream));

export default router;
