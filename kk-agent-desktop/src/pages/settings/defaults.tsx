import { useState } from "react";
import type { ModeBehavior } from "@/types/api";
import SettingsLayout from "@/components/SettingsLayout";
import Button from "@/components/Button";
import AgentCoreSection from "@/components/settings/AgentCoreSection";
import CollapsibleSection from "@/components/settings/CollapsibleSection";
import MiscSection from "@/components/settings/MiscSection";
import ModeInstructionsSection from "@/components/settings/ModeInstructionsSection";
import ModeToolInstructionsSection from "@/components/settings/ModeToolInstructionsSection";
import PromptSectionsEditor from "@/components/settings/PromptSectionsEditor";
import ReasoningSection from "@/components/settings/ReasoningSection";
import { useDefaultsForm } from "@/hooks/useDefaultsForm";
import { ActionsRow } from "@/components/PageForm";
import {
  Hint,
  PageWrapper,
  Panel,
  PanelTitle,
  SaveMsg,
} from "@/components/settings/defaults.styled";

const CHAT_MODES: ModeBehavior[] = ["plan", "edit", "autonomous"];

type SectionKey =
  | "agentCore"
  | "promptSections"
  | "modeInstructions"
  | "modeToolInstructions"
  | "misc"
  | "reasoning";

export default function DefaultsPage() {
  const { draft, setDraft, internalTools, saving, saved, error, dirty, save } = useDefaultsForm();
  const [selectedMode, setSelectedMode] = useState<ModeBehavior>("edit");
  const loading = !draft;
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    agentCore: true,
    promptSections: true,
    modeInstructions: true,
    modeToolInstructions: false,
    misc: false,
    reasoning: false,
  });

  function toggle(key: SectionKey) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <SettingsLayout loading={loading}>
      {draft ? (
        <PageWrapper>
          <Panel>
            <PanelTitle>Defaults</PanelTitle>
            <Hint>Global defaults for new agents in manual mode model.</Hint>

            <CollapsibleSection title="Agent Core" expanded={expanded.agentCore} onToggle={() => toggle("agentCore")}>
              <AgentCoreSection draft={draft} setDraft={setDraft} chatModes={CHAT_MODES} />
            </CollapsibleSection>

            <CollapsibleSection title="Prompt Sections" expanded={expanded.promptSections} onToggle={() => toggle("promptSections")}>
              <PromptSectionsEditor draft={draft} setDraft={setDraft} />
            </CollapsibleSection>

            <CollapsibleSection title="Mode Instructions" expanded={expanded.modeInstructions} onToggle={() => toggle("modeInstructions")}>
              <ModeInstructionsSection
                draft={draft}
                setDraft={setDraft}
                chatModes={CHAT_MODES}
                selectedMode={selectedMode}
                setSelectedMode={setSelectedMode}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Mode Tool Instructions" expanded={expanded.modeToolInstructions} onToggle={() => toggle("modeToolInstructions")}>
              <ModeToolInstructionsSection
                draft={draft}
                setDraft={setDraft}
                chatModes={CHAT_MODES}
                selectedMode={selectedMode}
                setSelectedMode={setSelectedMode}
                internalTools={internalTools}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Misc" expanded={expanded.misc} onToggle={() => toggle("misc")}>
              <MiscSection draft={draft} setDraft={setDraft} />
            </CollapsibleSection>

            <CollapsibleSection title="Reasoning" expanded={expanded.reasoning} onToggle={() => toggle("reasoning")}>
              <ReasoningSection draft={draft} setDraft={setDraft} />
            </CollapsibleSection>

            <ActionsRow>
              <Button onClick={() => void save()} disabled={!dirty || saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              {saved && <SaveMsg>Saved.</SaveMsg>}
              {error && <SaveMsg>{error}</SaveMsg>}
            </ActionsRow>
          </Panel>
        </PageWrapper>
      ) : null}
    </SettingsLayout>
  );
}
