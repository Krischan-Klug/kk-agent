import styled from "styled-components";
import type { LlmRequestConfig } from "@/types/api";
import { mergeLlmRequestConfigs } from "kk-agent-contract";
import Input from "@/components/Input";

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Title = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
`;

const Hint = styled.div`
  font-size: var(--font-size-xs);
  color: var(--text-muted);
`;

const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-sm);
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

type Props = {
  value?: LlmRequestConfig;
  onChange: (value: LlmRequestConfig | undefined) => void;
};

function readNumber(value: string): number | undefined {
  if (value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function SamplingSettings({ value, onChange }: Props) {
  function update(sampling: NonNullable<LlmRequestConfig["sampling"]>) {
    onChange(mergeLlmRequestConfigs(value, { sampling }));
  }

  return (
    <Wrap>
      <Header>
        <Title>Sampling</Title>
        <Hint>Leave blank to inherit the current default. Usually change temperature or top_p, not both.</Hint>
      </Header>
      <Fields>
        <Field>
          Temperature
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={value?.sampling?.temperature ?? ""}
            placeholder="provider default"
            onChange={(event) => update({ temperature: readNumber(event.target.value) })}
          />
        </Field>
        <Field>
          Top P
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={value?.sampling?.topP ?? ""}
            placeholder="provider default"
            onChange={(event) => update({ topP: readNumber(event.target.value) })}
          />
        </Field>
      </Fields>
    </Wrap>
  );
}
