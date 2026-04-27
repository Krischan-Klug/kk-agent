import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { doCreate, doDelete, doList, doUpdate } from "./controller.js";

const router = Router();

router.get("/", asyncHandler(doList));
router.post("/", asyncHandler(doCreate));
router.put("/:id", asyncHandler(doUpdate));
router.delete("/:id", asyncHandler(doDelete));

export default router;
