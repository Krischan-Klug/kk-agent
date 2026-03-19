import { Router } from "express";
import { getCore } from "./controller.js";

const router = Router();

router.get("/", getCore);

export default router;
