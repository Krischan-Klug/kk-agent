import { Router } from "express";
import multer from "multer";
import { doDelete, doImport, doList } from "./skills-handlers.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 200 },
});

router.get("/", doList);
router.post("/import", upload.array("files", 200), doImport);
router.delete("/:id", doDelete);

export default router;
