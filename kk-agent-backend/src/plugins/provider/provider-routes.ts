import { Router } from "express";
import {
  listModels,
  doSetModelSettings,
  doListProviders,
  doAddProvider,
  doUpdateProvider,
  doRemoveProvider,
  doTestProvider,
} from "./provider-handlers.js";

const router = Router();

router.get("/models", listModels);
router.put("/models/:modelId/settings", doSetModelSettings);

router.get("/providers", doListProviders);
router.post("/providers", doAddProvider);
router.put("/providers/:id", doUpdateProvider);
router.delete("/providers/:id", doRemoveProvider);
router.post("/providers/:id/test", doTestProvider);

export default router;
