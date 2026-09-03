import { Router } from "express";
import { getSettings, updateSettings } from "./security-handlers.js";

const router = Router();

router.get("/", getSettings);
router.put("/", updateSettings);

export default router;
