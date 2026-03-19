import { Router } from "express";
import { getLib } from "./controller.js";

const router = Router();

router.get("/", getLib);

export default router;
