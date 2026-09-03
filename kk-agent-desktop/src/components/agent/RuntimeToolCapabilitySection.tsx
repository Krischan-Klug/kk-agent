import { useState } from "react";
import type { ReactNode } from "react";
import type { AgentModeConfig, RuntimeCapability } from "@/types/api";
import SkillIcon from "@/components/SkillIcon";
import { toggleId } from "@/lib/idLists";
import {
  CapabilityRow,
} from "./AgentEditor.styled";
import {
  getCapabilityToolNames,
  getConcreteRuntimeTools,
  normalizeAllowedToolNames,
  setCapabilityInstruction,
} from "./AgentEditor.helpers";
import {
  CapabilityInstructionEditor,
  CapabilityToggleHeader,
  NestedCapabilityToolList,
} from "./CapabilitySection";
import { FieldLabel, FormField, Section, SectionTitle } from "@/components/PageForm";

type RuntimeCapabilityIdField = "toolIds" | "mcpIds";
type RuntimeCapabilityInstructionField = "toolInstructions" | "mcpInstructions";

type Props = {
  title: string;
  groups: RuntimeCapability[];
  idField: RuntimeCapabilityIdField;
  instructionField: RuntimeCapabilityInstructionField;
  selectedModeConfig: AgentModeConfig;
  internalTools: RuntimeCapability[];
  mcps: RuntimeCapability[];
  emojiFallback: string;
  getEffectiveInstruction: (group: RuntimeCapability) => string;
  getInstructionFallback: (group: RuntimeCapability) => string;
  renderActiveControls?: (group: RuntimeCapability) => ReactNode;
  updateModeConfig: (nextConfig: AgentModeConfig) => void;
};

export default function RuntimeToolCapabilitySection({
  title,
  groups,
  idField,
  instructionField,
  selectedModeConfig,
  internalTools,
  mcps,
  emojiFallback,
  getEffectiveInstruction,
  getInstructionFallback,
  renderActiveControls,
  updateModeConfig,
}: Props) {
  const activeIds = selectedModeConfig[idField];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <Section>
      <SectionTitle>{title}</SectionTitle>
      {groups.map((group) => {
        const isActive = activeIds.includes(group.id);
        const isExpanded = expanded[group.id] ?? false;
        const capabilityToolNames = getCapabilityToolNames(group);
        const explicitlyAllowedToolNames = selectedModeConfig.allowedToolNames
          .filter((name) => capabilityToolNames.includes(name));
        // An empty allow-list for a capability means that all of its tools are enabled.
        const activeToolNames = explicitlyAllowedToolNames.length > 0
          ? explicitlyAllowedToolNames
          : capabilityToolNames;
        const effectiveInstruction = getEffectiveInstruction(group);
        const instructionFallback = getInstructionFallback(group);
        const isCustomized = effectiveInstruction.trim() !== instructionFallback.trim();

        return (
          <CapabilityRow key={group.id} $active={isActive}>
            <CapabilityToggleHeader
              active={isActive}
              icon={group.id === "skill" ? <SkillIcon /> : group.emoji || emojiFallback}
              name={group.name}
              running={group.runtime.status === "running"}
              expanded={isExpanded}
              customized={isCustomized}
              onToggle={() => {
                const nextIds = toggleId(activeIds, group.id);
                const nextAllowedRaw = isActive
                  ? selectedModeConfig.allowedToolNames.filter((name) => !capabilityToolNames.includes(name))
                  : [...selectedModeConfig.allowedToolNames, ...capabilityToolNames];
                const nextModeConfig: AgentModeConfig = { ...selectedModeConfig, [idField]: nextIds };
                updateModeConfig({
                  ...nextModeConfig,
                  allowedToolNames: normalizeAllowedToolNames(
                    nextAllowedRaw,
                    getConcreteRuntimeTools(nextModeConfig, internalTools, mcps),
                  ),
                });
              }}
              onToggleExpanded={() => setExpanded((current) => ({
                ...current,
                [group.id]: !isExpanded,
              }))}
              onResetInstruction={() => updateModeConfig({
                ...selectedModeConfig,
                [instructionField]: setCapabilityInstruction(
                  selectedModeConfig[instructionField],
                  group.id,
                  instructionFallback,
                  instructionFallback,
                ),
              } as AgentModeConfig)}
            />
            {isActive && isExpanded && (
              <>
                <FormField>
                  <FieldLabel>Tool Instruction</FieldLabel>
                  <CapabilityInstructionEditor
                    value={effectiveInstruction}
                    rows={4}
                    onChange={(value) => updateModeConfig({
                      ...selectedModeConfig,
                      [instructionField]: setCapabilityInstruction(
                        selectedModeConfig[instructionField],
                        group.id,
                        value,
                        instructionFallback,
                      ),
                    } as AgentModeConfig)}
                  />
                </FormField>
                {renderActiveControls?.(group)}
                <NestedCapabilityToolList
                  tools={group.tools}
                  activeToolNames={activeToolNames}
                  onToggleTool={(toolName) => {
                    const nextActiveToolNames = activeToolNames.includes(toolName)
                      ? activeToolNames.filter((name) => name !== toolName)
                      : [...activeToolNames, toolName];
                    const nextIds = nextActiveToolNames.length > 0
                      ? activeIds
                      : activeIds.filter((id) => id !== group.id);
                    const nextAllowedRaw = [
                      ...selectedModeConfig.allowedToolNames.filter((name) => !capabilityToolNames.includes(name)),
                      ...nextActiveToolNames,
                    ];
                    const nextModeConfig: AgentModeConfig = { ...selectedModeConfig, [idField]: nextIds };
                    updateModeConfig({
                      ...nextModeConfig,
                      allowedToolNames: normalizeAllowedToolNames(
                        nextAllowedRaw,
                        getConcreteRuntimeTools(nextModeConfig, internalTools, mcps),
                      ),
                    });
                  }}
                />
              </>
            )}
          </CapabilityRow>
        );
      })}
    </Section>
  );
}
