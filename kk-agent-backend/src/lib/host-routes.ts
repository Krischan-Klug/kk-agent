import { Router } from "express";
import { z } from "zod";
import { requireDesktopHostToken } from "./host-auth.js";
import { replaceRuntimeCredentials } from "../plugins/mcp/lib/credentials.js";
import { refreshActiveMcps } from "../plugins/mcp/service.js";
import { refreshManagedMcpConnections } from "../plugins/tools/service.js";

const CredentialSyncSchema = z.object({
  credentials: z.record(z.string().min(1), z.string()),
}).strict();

const router = Router();

router.use(requireDesktopHostToken);
router.put("/credentials", async (req, res) => {
  const { credentials } = CredentialSyncSchema.parse(req.body);
  const changedCredentialIds = replaceRuntimeCredentials(credentials);
  await Promise.all([
    refreshActiveMcps(changedCredentialIds),
    refreshManagedMcpConnections(changedCredentialIds),
  ]);
  return res.json({ ok: true, count: Object.keys(credentials).length });
});

export default router;
