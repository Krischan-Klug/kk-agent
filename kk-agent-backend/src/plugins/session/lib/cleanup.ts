import { listSessions, updateSession } from "./store.js";

type SessionIdArrayField = "activeMcpIds" | "activeToolIds" | "activeSkillIds";

async function removeIdFromSessionField(id: string, field: SessionIdArrayField): Promise<void> {
  for (const session of listSessions()) {
    const current = session[field];
    if (!current.includes(id)) continue;
    await updateSession(session.id, {
      [field]: current.filter((entry) => entry !== id),
    });
  }
}

export async function removeMcpFromSessions(mcpId: string): Promise<void> {
  await removeIdFromSessionField(mcpId, "activeMcpIds");
}

export async function removeSkillFromSessions(skillId: string): Promise<void> {
  await removeIdFromSessionField(skillId, "activeSkillIds");
}
