import { useState } from "react";
import styled from "styled-components";
import SettingsLayout from "@/components/SettingsLayout";
import Button from "@/components/Button";
import Input from "@/components/Input";
import {
  defaultThemes,
  getAllThemes,
  getSavedThemeColorMode,
  getSavedThemeId,
  saveAndApplyTheme,
  addCustomTheme,
  deleteCustomTheme,
  setThemeColorMode,
  buildVariablesFromAccent,
  resolveThemeColorMode,
  type Theme,
  type ThemePreferenceMode,
} from "@/lib/themes";

/* Styled */

const SectionTitle = styled.h3`
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 var(--space-md) 0;
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
`;

const ThemeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-md);
`;

const ThemeCard = styled.div<{ $active: boolean; $accentColor: string }>`
  background: var(--bg-elevated);
  border: 2px solid
    ${(p) => (p.$active ? p.$accentColor : "var(--border)")};
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  height: 184px;
  cursor: pointer;
  transition: border-color 0.15s ease;
  position: relative;
  display: flex;
  flex-direction: column;

  &:hover {
    border-color: ${(p) => p.$accentColor};
  }
`;

const ThemeName = styled.h4`
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  height: 24px;
  margin: 0 0 var(--space-xs) 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ThemeDesc = styled.p`
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  height: 42px;
  margin: 0 0 var(--space-sm) 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const ColorPreview = styled.div`
  display: flex;
  gap: var(--space-sm);
  margin-top: auto;
`;

const ColorDot = styled.div<{ $color: string }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  border: 1px solid rgba(0, 0, 0, 0.35);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55);
  flex: 0 0 24px;
`;

const DeleteBtn = styled.button`
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);

  &:hover {
    color: var(--danger);
    background: var(--bg-hover);
  }
`;

const AddCard = styled.div`
  background: var(--bg-elevated);
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  height: 184px;
  transition: border-color 0.15s;
  color: var(--text-muted);
  font-size: var(--font-size-lg);

  &:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
`;

const CreateForm = styled.div`
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-md);
`;

const FieldLabel = styled.label`
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  display: block;
  margin-bottom: 2px;
`;

const ColorRow = styled.div`
  display: flex;
  gap: var(--space-md);
  align-items: flex-end;
`;

const ColorField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ColorInput = styled.input`
  width: 48px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-base);
  cursor: pointer;
  padding: 2px;

  &::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  &::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
`;

const PreviewStrip = styled.div`
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  margin-top: var(--space-xs);
`;

const ThemeMode = styled.span`
  font-size: 0.6875rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const ThemeModeControl = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-sm);
`;

const ThemeToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 32px;
  padding: 0 var(--space-sm);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    border-color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const themeModeMeta: Record<ThemePreferenceMode, { emoji: string; label: string }> = {
  system: { emoji: "💻", label: "System" },
  light: { emoji: "☀️", label: "Hell" },
  dark: { emoji: "🌙", label: "Dunkel" },
};

function getNextThemeMode(mode: ThemePreferenceMode): ThemePreferenceMode {
  return mode === "system" ? "light" : mode === "light" ? "dark" : "system";
}

/* Page */

export default function AppearancePage() {
  const defaultTheme = defaultThemes[0];
  const [activeId, setActiveId] = useState(getSavedThemeId());
  const [themes, setThemes] = useState(getAllThemes());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accent, setAccent] = useState(defaultTheme.variables["--accent"]);
  const [colorMode, setColorMode] = useState<ThemePreferenceMode>(getSavedThemeColorMode());

  function selectTheme(theme: Theme) {
    saveAndApplyTheme(theme.id);
    setActiveId(theme.id);
  }

  function handleCreate() {
    if (!name.trim()) return;
    const id = `custom-${Date.now()}`;
    const theme: Theme = {
      id,
      name: name.trim(),
      description: description.trim(),
      custom: true,
      variables: buildVariablesFromAccent(accent, resolveThemeColorMode(colorMode)),
    };
    addCustomTheme(theme);
    setThemes(getAllThemes());
    saveAndApplyTheme(id);
    setActiveId(id);
    setCreating(false);
    setName("");
    setDescription("");
    setAccent(defaultTheme.variables["--accent"]);
  }

  function handleDelete(id: string) {
    deleteCustomTheme(id);
    const updated = getAllThemes();
    setThemes(updated);
    if (activeId === id) {
      saveAndApplyTheme(defaultTheme.id);
      setActiveId(defaultTheme.id);
    }
  }

  function handleModeChange(colorMode: ThemePreferenceMode) {
    setThemeColorMode(colorMode);
    setColorMode(colorMode);
    const updated = getAllThemes();
    setThemes(updated);
    saveAndApplyTheme(activeId);
  }

  const previewVars = buildVariablesFromAccent(accent, resolveThemeColorMode(colorMode));
  const activeThemeModeMeta = themeModeMeta[colorMode];

  return (
    <SettingsLayout>
      <PageHeader>
        <SectionTitle>🎨 Theme</SectionTitle>
        <ThemeModeControl>
          <ThemeToggle
            type="button"
            title={`${activeThemeModeMeta.label}: klicken zum Wechseln`}
            aria-label={`Erscheinungsbild: ${activeThemeModeMeta.label}. Klicken zum Wechseln.`}
            onClick={() => handleModeChange(getNextThemeMode(colorMode))}
          >
            <span aria-hidden>{activeThemeModeMeta.emoji}</span>
            <ThemeMode>{activeThemeModeMeta.label}</ThemeMode>
          </ThemeToggle>
        </ThemeModeControl>
      </PageHeader>
      <ThemeGrid>
        {themes.map((theme) => (
          <ThemeCard
            key={theme.id}
            $active={theme.id === activeId}
            $accentColor={theme.variables["--accent"]}
            onClick={() => selectTheme(theme)}
          >
            {theme.custom && (
              <DeleteBtn
                title="Delete theme"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(theme.id);
                }}
              >
                ✕
              </DeleteBtn>
            )}
            <ThemeName>{theme.name}</ThemeName>
            <ThemeDesc>{theme.description}</ThemeDesc>
            <ColorPreview>
              <ColorDot $color={theme.variables["--accent"]} />
              <ColorDot $color={theme.variables["--accent-hover"]} />
              <ColorDot $color={theme.variables["--accent-muted"]} />
            </ColorPreview>
          </ThemeCard>
        ))}
        {!creating && (
          <AddCard onClick={() => setCreating(true)}>＋</AddCard>
        )}
      </ThemeGrid>

      {creating && (
        <CreateForm>
          <SectionTitle style={{ margin: 0 }}>New Theme</SectionTitle>

          <FieldLabel>Name</FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Neon Purple"
          />

          <FieldLabel>Description</FieldLabel>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description..."
          />

          <ColorRow>
            <ColorField>
              <FieldLabel>Accent color</FieldLabel>
              <ColorInput
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              />
            </ColorField>
            <PreviewStrip>
              <ColorDot $color={previewVars["--accent"]} />
              <ColorDot $color={previewVars["--accent-hover"]} />
              <ColorDot $color={previewVars["--accent-muted"]} />
            </PreviewStrip>
          </ColorRow>

          <FormActions>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Create
            </Button>
            <Button onClick={() => setCreating(false)} style={{ background: "var(--bg-hover)" }}>
              Cancel
            </Button>
          </FormActions>
        </CreateForm>
      )}
    </SettingsLayout>
  );
}
