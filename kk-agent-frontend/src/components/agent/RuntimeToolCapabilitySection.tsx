import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { AgentModeConfig, McpListItem } from "@/types/api";
import { toggleId } from "@/lib/idLists";
import {
  CapabilityRow,
} from "./AgentEditor.styled";
import {
  getCapabilityToolNames,
  getConcreteRuntimeTools,
  hasAllowedToolForCapability,
  normalizeAllowedToolNames,
  setCapabilityInstruction,
} from "./AgentEditor.helpers";
import {
  CapabilityInstructionEditor,
  CapabilityToggleHeader,
  NestedCapabilityToolList,
} from "./CapabilitySection";
import { Section, SectionTitle } from "@/components/PageForm";

type RuntimeCapabilityIdField = "toolIds" | "mcpIds";
type RuntimeCapabilityInstructionField = "toolInstructions" | "mcpInstructions";

type Props = {
  title: string;
  groups: McpListItem[];
  idField: RuntimeCapabilityIdField;
  instructionField: RuntimeCapabilityInstructionField;
  selectedModeConfig: AgentModeConfig;
  internalTools: McpListItem[];
  mcps: McpListItem[];
  expanded: Record<string, boolean>;
  visibleInstructions: Record<string, boolean>;
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVisibleInstructions: Dispatch<SetStateAction<Record<string, boolean>>>;
  detailsOpenLabel?: string;
  emojiFallback: string;
  getEffectiveInstruction: (group: McpListItem) => string;
  getInstructionFallback: (group: McpListItem) => string;
  renderActiveControls?: (group: McpListItem) => ReactNode;
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
  expanded,
  visibleInstructions,
  setExpanded,
  setVisibleInstructions,
  detailsOpenLabel,
  emojiFallback,
  getEffectiveInstruction,
  getInstructionFallback,
  renderActiveControls,
  updateModeConfig,
}: Props) {
  const activeIds = selectedModeConfig[idField];

  return (
    <Section>
      <SectionTitle>{title}</SectionTitle>
      {groups.map((group) => {
        const isActive = activeIds.includes(group.id);
        const capabilityToolNames = getCapabilityToolNames(group);
        const isExpanded = expanded[group.id] ?? false;
        const showInstruction = visibleInstructions[group.id] ?? false;
        const effectiveInstruction = getEffectiveInstruction(group);
        const instructionFallback = getInstructionFallback(group);
        const isCustomized = effectiveInstruction.trim() !== instructionFallback.trim();

        return (
          <CapabilityRow key={group.id} $active={isActive}>
            <CapabilityToggleHeader
              active={isActive}
              emoji={group.emoji || emojiFallback}
              name={group.name}
              running={group.running}
              showDetails
              detailsOpen={isExpanded}
              detailsOpenLabel={detailsOpenLabel}
              instructionOpen={showInstruction}
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
              onToggleDetails={() => setExpanded((previous) => ({ ...previous, [group.id]: !isExpanded }))}
              onToggleInstruction={() => setVisibleInstructions((previous) => ({ ...previous, [group.id]: !showInstruction }))}
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
            {isActive && (
              <>
                {showInstruction && (
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
                )}
                {renderActiveControls?.(group)}
                {isExpanded && (
                  <NestedCapabilityToolList
                    tools={group.tools}
                    allowedToolNames={selectedModeConfig.allowedToolNames}
                    onToggleTool={(toolName, allowed) => {
                      const updated = allowed
                        ? selectedModeConfig.allowedToolNames.filter((entry) => entry !== toolName)
                        : [...new Set([...selectedModeConfig.allowedToolNames, toolName])];
                      const nextIds = hasAllowedToolForCapability(updated, capabilityToolNames)
                        ? activeIds
                        : activeIds.filter((entry) => entry !== group.id);
                      const nextModeConfig: AgentModeConfig = { ...selectedModeConfig, [idField]: nextIds };
                      updateModeConfig({
                        ...nextModeConfig,
                        allowedToolNames: normalizeAllowedToolNames(
                          updated,
                          getConcreteRuntimeTools(nextModeConfig, internalTools, mcps),
                        ),
                      });
                    }}
                  />
                )}
              </>
            )}
          </CapabilityRow>
        );
      })}
    </Section>
  );
}
