import { Router } from "express";
import { getSettings, updateSettings } from "./controller.js";

const router = Router();

router.get("/", getSettings);
router.put("/", updateSettings);

export default router;
