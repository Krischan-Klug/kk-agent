import { Router, Request, Response } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { getDefaults, updateDefaults } from "./defaults.js";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json(getDefaults());
});

router.put("/", asyncHandler(async (req: Request, res: Response) => {
  const updated = await updateDefaults(req.body);
  res.json(updated);
}));

export default router;
