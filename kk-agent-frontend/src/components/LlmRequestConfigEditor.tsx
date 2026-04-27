import { useState } from "react";
import styled from "styled-components";
import type { EndpointCapabilities, EndpointType, LlmRequestConfig } from "@/types/api";
import { stringifyJsonValue, tryParseJsonObject } from "@/lib/llmRequestConfig";
import { createLogger } from "@/lib/logger";

const logger = createLogger("llm-request-config");

const EditorWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SectionTitle = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
`;

const SectionHint = styled.div`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-sm);
`;

const FieldCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
`;

const Label = styled.label`
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  outline: none;
  font-family: var(--font-mono);

  &:focus {
    border-color: var(--border-focus);
  }
`;

const JsonEditor = styled.textarea`
  min-height: 120px;
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  outline: none;
  font-family: var(--font-mono);
  resize: vertical;

  &:focus {
    border-color: var(--border-focus);
  }
`;

type Props = {
  value?: LlmRequestConfig;
  selectedEndpoint: EndpointType;
  endpointCapabilities?: EndpointCapabilities;
  onChange: (patch: LlmRequestConfig) => void;
};

type DraftEditorProps = {
  initialValue: string;
  placeholder?: string;
  onCommit: (draft: string) => void;
};

function DraftEditor({ initialValue, placeholder, onCommit }: DraftEditorProps) {
  const [draft, setDraft] = useState(initialValue);

  return (
    <JsonEditor
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      placeholder={placeholder}
    />
  );
}

function getExtraBodyPlaceholder(endpoint: EndpointType): string {
  void endpoint;
  return `{
  "chat_template_kwargs": {
    "enable_thinking": true,
    "preserve_thinking": true
  },
  "top_p": 0.95,
  "top_k": 20,
  "min_p": 0
}`;
}

export default function LlmRequestConfigEditor({
  value,
  selectedEndpoint,
  endpointCapabilities,
  onChange,
}: Props) {
  const extraBodyValue = stringifyJsonValue(value?.extraBody?.[selectedEndpoint]);

  function commitJsonPatch(draft: string) {
    try {
      onChange({
        extraBody: {
          [selectedEndpoint]: tryParseJsonObject(draft),
        },
      });
    } catch (error) {
      logger.error("Failed to parse extra body:", error);
    }
  }

  return (
    <EditorWrap>
      <Section>
        <SectionHeader>
          <SectionTitle>Request settings</SectionTitle>
          <SectionHint>
            Use this for wrapper-owned request values or session overrides. Context size, KV cache and backend runtime
            settings belong in LM Studio or Ollama.
          </SectionHint>
        </SectionHeader>
        <FieldGrid>
          {endpointCapabilities?.temperatureSupported && (
            <FieldCard>
              <Label>Temperature</Label>
              <Input
                type="number"
                min={endpointCapabilities.temperatureRange?.min}
                max={endpointCapabilities.temperatureRange?.max}
                step={endpointCapabilities.temperatureRange?.step ?? 0.1}
                value={value?.common?.temperature ?? ""}
                placeholder="default"
                onChange={(event) => onChange({
                  common: {
                    temperature: event.target.value === "" ? undefined : Number(event.target.value),
                  },
                })}
              />
            </FieldCard>
          )}
          {endpointCapabilities?.maxOutputTokensSupported && (
            <FieldCard>
              <Label>Max Output Tokens</Label>
              <Input
                type="number"
                min={endpointCapabilities.maxOutputTokensRange?.min ?? 1}
                max={endpointCapabilities.maxOutputTokensRange?.max}
                step={endpointCapabilities.maxOutputTokensRange?.step ?? 1}
                value={value?.common?.maxOutputTokens ?? ""}
                placeholder="default"
                onChange={(event) => onChange({
                  common: {
                    maxOutputTokens: event.target.value === "" ? undefined : Number(event.target.value),
                  },
                })}
              />
            </FieldCard>
          )}
        </FieldGrid>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Additional Request JSON</SectionTitle>
          <SectionHint>
            Rare request parameters only. Example for Qwen on {selectedEndpoint}: {getExtraBodyPlaceholder(selectedEndpoint)}
          </SectionHint>
        </SectionHeader>
        <FieldCard>
          <Label>{selectedEndpoint}</Label>
          <DraftEditor
            key={`${selectedEndpoint}:${extraBodyValue}`}
            initialValue={extraBodyValue}
            onCommit={commitJsonPatch}
            placeholder={getExtraBodyPlaceholder(selectedEndpoint)}
          />
        </FieldCard>
      </Section>
    </EditorWrap>
  );
}
