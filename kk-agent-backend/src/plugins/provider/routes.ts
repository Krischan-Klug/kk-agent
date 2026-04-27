import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  listModels,
  doSetModelSettings,
  doListProviders,
  doAddProvider,
  doUpdateProvider,
  doRemoveProvider,
  doTestProvider,
} from "./controller.js";

const router = Router();

router.get("/models", asyncHandler(listModels));
router.put("/models/:modelId/settings", asyncHandler(doSetModelSettings));

router.get("/providers", asyncHandler(doListProviders));
router.post("/providers", asyncHandler(doAddProvider));
router.put("/providers/:id", asyncHandler(doUpdateProvider));
router.delete("/providers/:id", asyncHandler(doRemoveProvider));
router.post("/providers/:id/test", asyncHandler(doTestProvider));

export default router;
