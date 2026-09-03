import { useState } from "react";
import styled from "styled-components";
import SettingsLayout from "@/components/SettingsLayout";
import {
  accentPresets,
  getSavedAccentId,
  getSavedThemeColorMode,
  saveAndApplyAccent,
  setThemeColorMode,
  type ThemePreferenceMode,
} from "@/lib/themes";

const ModeRow = styled.div`
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
`;

const Choice = styled.button<{ $active: boolean; $accent?: string }>`
  padding: var(--space-md) var(--space-lg);
  border: 1px solid ${({ $active, $accent }) => $active ? ($accent ?? "var(--accent)") : "var(--border)"};
  border-radius: var(--radius-md);
  background: ${({ $active }) => $active ? "var(--accent-muted)" : "var(--bg-elevated)"};
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
`;

const AccentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-md);
`;

const Dot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: var(--space-sm);
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

export default function AppearancePage() {
  const [mode, setMode] = useState<ThemePreferenceMode>(getSavedThemeColorMode());
  const [accentId, setAccentId] = useState(getSavedAccentId());

  function selectMode(next: ThemePreferenceMode) {
    setMode(next);
    setThemeColorMode(next);
    saveAndApplyAccent(accentId);
  }

  function selectAccent(id: string) {
    setAccentId(id);
    saveAndApplyAccent(id);
  }

  return (
    <SettingsLayout>
      <h3>Color mode</h3>
      <ModeRow>
        {(["light", "dark", "system"] as const).map((value) => (
          <Choice key={value} type="button" $active={mode === value} onClick={() => selectMode(value)}>
            {value[0].toUpperCase() + value.slice(1)}
          </Choice>
        ))}
      </ModeRow>
      <h3>Accent</h3>
      <AccentGrid>
        {accentPresets.map((accent) => (
          <Choice key={accent.id} type="button" $active={accent.id === accentId} $accent={accent.color} onClick={() => selectAccent(accent.id)}>
            <Dot $color={accent.color} />{accent.name}
          </Choice>
        ))}
      </AccentGrid>
    </SettingsLayout>
  );
}
