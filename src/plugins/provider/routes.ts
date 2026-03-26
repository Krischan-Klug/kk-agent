import { Router } from "express";
import {
  listModels,
  doSwitchModel,
  doSetModelSettings,
  doListProviders,
  doAddProvider,
  doUpdateProvider,
  doRemoveProvider,
  doActivateProvider,
  doTestProvider,
} from "./controller.js";

const router = Router();

/* Model endpoints (unchanged) */
router.get("/models", listModels);
router.put("/models/:modelId/settings", doSetModelSettings);
router.post("/switch", doSwitchModel);

/* Provider CRUD */
router.get("/providers", doListProviders);
router.post("/providers", doAddProvider);
router.put("/providers/:id", doUpdateProvider);
router.delete("/providers/:id", doRemoveProvider);
router.post("/providers/:id/activate", doActivateProvider);
router.post("/providers/:id/test", doTestProvider);

export default router;
