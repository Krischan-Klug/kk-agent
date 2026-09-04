import { useState } from "react";
import type { ReactNode } from "react";
import type { AgentConfig } from "kk-agent-contract";
import type { RuntimeCapability } from "@/types/runtime";
import SkillIcon from "@/components/SkillIcon";
import { toggleId } from "@/lib/idLists";
import {
  CapabilityRow,
} from "./AgentEditor.styled";
import {
  getCapabilityToolNames,
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
  agentConfig: AgentConfig;
  internalTools: RuntimeCapability[];
  mcps: RuntimeCapability[];
  emojiFallback: string;
  getEffectiveInstruction: (group: RuntimeCapability) => string;
  getInstructionFallback: (group: RuntimeCapability) => string;
  renderActiveControls?: (group: RuntimeCapability) => ReactNode;
  updateAgentConfig: (nextConfig: AgentConfig) => void;
};

export default function RuntimeToolCapabilitySection({
  title,
  groups,
  idField,
  instructionField,
  agentConfig,
  internalTools,
  mcps,
  emojiFallback,
  getEffectiveInstruction,
  getInstructionFallback,
  renderActiveControls,
  updateAgentConfig,
}: Props) {
  const activeIds = agentConfig[idField];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <Section>
      <SectionTitle>{title}</SectionTitle>
      {groups.map((group) => {
        const isActive = activeIds.includes(group.id);
        const isExpanded = expanded[group.id] ?? false;
        const capabilityToolNames = getCapabilityToolNames(group);
        const explicitlyAllowedToolNames = agentConfig.allowedToolNames
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
                  ? agentConfig.allowedToolNames.filter((name) => !capabilityToolNames.includes(name))
                  : [...agentConfig.allowedToolNames, ...capabilityToolNames];
                const nextAgentConfig: AgentConfig = { ...agentConfig, [idField]: nextIds };
                updateAgentConfig({
                  ...nextAgentConfig,
                  allowedToolNames: normalizeAllowedToolNames(
                    nextAllowedRaw,
                    nextAgentConfig,
                    internalTools,
                    mcps,
                  ),
                });
              }}
              onToggleExpanded={() => setExpanded((current) => ({
                ...current,
                [group.id]: !isExpanded,
              }))}
              onResetInstruction={() => updateAgentConfig({
                ...agentConfig,
                [instructionField]: setCapabilityInstruction(
                  agentConfig[instructionField],
                  group.id,
                  instructionFallback,
                  instructionFallback,
                ),
              } as AgentConfig)}
            />
            {isActive && isExpanded && (
              <>
                <FormField>
                  <FieldLabel>Tool Instruction</FieldLabel>
                  <CapabilityInstructionEditor
                    value={effectiveInstruction}
                    rows={4}
                    onChange={(value) => updateAgentConfig({
                      ...agentConfig,
                      [instructionField]: setCapabilityInstruction(
                        agentConfig[instructionField],
                        group.id,
                        value,
                        instructionFallback,
                      ),
                    } as AgentConfig)}
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
                      ...agentConfig.allowedToolNames.filter((name) => !capabilityToolNames.includes(name)),
                      ...nextActiveToolNames,
                    ];
                    const nextAgentConfig: AgentConfig = { ...agentConfig, [idField]: nextIds };
                    updateAgentConfig({
                      ...nextAgentConfig,
                      allowedToolNames: normalizeAllowedToolNames(
                        nextAllowedRaw,
                        nextAgentConfig,
                        internalTools,
                        mcps,
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
