import { useEffect, useState } from "react";
import { settings as settingsApi, tools as toolsApi } from "@/lib/api";
import type { AppDefaults, McpListItem } from "@/types/api";
import { useApiQuery } from "./useApiQuery";

interface UseDefaultsForm {
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: loaded } = useApiQuery(async () => {
    const [data, tools] = await Promise.all([settingsApi.getDefaults(), toolsApi.list()]);
    return { data, tools };
  });

  useEffect(() => {
    if (loaded && defaults === null) {
      setDefaults(loaded.data);
      setDraft(loaded.data);
    }
  }, [loaded, defaults]);

  const internalTools = loaded?.tools ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(defaults);

  async function save(): Promise<void> {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await settingsApi.updateDefaults(draft);
      setDefaults(updated);
      setDraft(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return { draft, setDraft, internalTools, saving, saved, error: saveError, dirty, save };
}
