import { Router } from "express";
import { listModels, doSwitchModel, doSetModelSettings } from "./controller.js";

const router = Router();

router.get("/models", listModels);
router.put("/models/:modelId/settings", doSetModelSettings);
router.post("/switch", doSwitchModel);

export default router;
