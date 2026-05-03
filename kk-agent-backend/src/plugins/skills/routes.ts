import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/async-handler.js";
import { doCreate, doDelete, doImport, doList, doUpdate, doUpdateLinks } from "./controller.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 200 },
});

router.get("/", asyncHandler(doList));
router.post("/import", upload.array("files", 200), asyncHandler(doImport));
router.post("/", asyncHandler(doCreate));
router.put("/:id/links", asyncHandler(doUpdateLinks));
router.put("/:id", asyncHandler(doUpdate));
router.delete("/:id", asyncHandler(doDelete));

export default router;
