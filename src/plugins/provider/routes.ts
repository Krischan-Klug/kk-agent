import { Router } from "express";
import { listModels, doSwitchModel, doGetModelSettings, doSetModelSettings } from "./controller.js";

const router = Router();

router.get("/models", listModels);
router.get("/model-settings", doGetModelSettings);
router.put("/models/:modelId/settings", doSetModelSettings);
router.post("/switch", doSwitchModel);

export default router;
