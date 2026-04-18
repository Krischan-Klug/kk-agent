import { useEffect, useState } from "react";
import { settings as settingsApi, tools as toolsApi } from "@/lib/api";
import type { AppDefaults, McpListItem } from "@/types/api";

export interface UseDefaultsForm {
  draft: AppDefaults | null;
  setDraft: (draft: AppDefaults) => void;
  internalTools: McpListItem[];
  saving: boolean;
  saved: boolean;
  error: string | null;
  dirty: boolean;
  save: () => Promise<void>;
}

export function useDefaultsForm(): UseDefaultsForm {
  const [defaults, setDefaults] = useState<AppDefaults | null>(null);
  const [draft, setDraft] = useState<AppDefaults | null>(null);
  const [internalTools, setInternalTools] = useState<McpListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([settingsApi.getDefaults(), toolsApi.list()]).then(([data, tools]) => {
      setDefaults(data);
      setDraft(data);
      setInternalTools(tools);
    });
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(defaults);

  async function save(): Promise<void> {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsApi.updateDefaults(draft);
      setDefaults(updated);
      setDraft(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return { draft, setDraft, internalTools, saving, saved, error, dirty, save };
}
