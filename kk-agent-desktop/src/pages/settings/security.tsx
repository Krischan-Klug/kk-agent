import { useEffect, useState } from "react";
import styled from "styled-components";
import SettingsLayout from "@/components/SettingsLayout";
import Button from "@/components/Button";
import { Select } from "@/components/FormControls.styled";
import { ActionsRow, FieldLabel, FormField, MutedText, Section, SectionTitle } from "@/components/PageForm";
import { settings as settingsApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type { SecuritySettings } from "@/types/api";

const logger = createLogger("settings/security");

const SettingsCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  max-width: 640px;
  padding: var(--space-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
`;

export default function SecurityPage() {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void settingsApi.getSecurity()
      .then(setSettings)
      .catch((error) => logger.error("Failed to load security settings:", error));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      setSettings(await settingsApi.updateSecurity(settings));
      setSaved(true);
    } catch (error) {
      logger.error("Failed to save security settings:", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsLayout loading={!settings}>
      {settings && (
        <SettingsCard>
          <Section>
            <SectionTitle>Security defaults</SectionTitle>
            <MutedText>Scope is inherited by agent modes without an override. Approval initializes new sessions. Both settings remain independent.</MutedText>
          </Section>
          <FormField>
            <FieldLabel>Access scope</FieldLabel>
            <Select
              value={settings.accessScope}
              onChange={(event) => setSettings({ ...settings, accessScope: event.target.value as SecuritySettings["accessScope"] })}
            >
              <option value="user">User directory and descendants</option>
              <option value="system">Entire system</option>
            </Select>
            <MutedText>This is the hard filesystem and terminal path boundary.</MutedText>
          </FormField>
          <FormField>
            <FieldLabel>Approval mode</FieldLabel>
            <Select
              value={settings.approvalMode}
              onChange={(event) => setSettings({ ...settings, approvalMode: event.target.value as SecuritySettings["approvalMode"] })}
            >
              <option value="ask_approval">Ask approval</option>
              <option value="full_access">Full access</option>
            </Select>
            <MutedText>Full access skips command confirmation but never expands the access scope.</MutedText>
          </FormField>
          <ActionsRow>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            {saved && <MutedText>Saved.</MutedText>}
          </ActionsRow>
        </SettingsCard>
      )}
    </SettingsLayout>
  );
}
