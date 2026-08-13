import Input from "@/components/Input";
import type { AutonomousBudget } from "@/types/api";
import { FieldLabel, FormField, FormRow } from "@/components/PageForm";

type BudgetField = {
  key: keyof AutonomousBudget;
  label: string;
};

const DEFAULT_FIELDS: BudgetField[] = [
  { key: "maxInputTokens", label: "Max Input Tokens" },
  { key: "maxOutputTokens", label: "Max Output Tokens" },
];

const FULL_FIELDS: BudgetField[] = [
  ...DEFAULT_FIELDS,
  { key: "maxWallClockMs", label: "Max Wall Clock Ms" },
  { key: "maxConsecutiveAutoContinues", label: "Max Auto Continues" },
];

type Props = {
  value?: AutonomousBudget;
  onChange: (value: AutonomousBudget) => void;
  full?: boolean;
};

export default function AutonomousBudgetFields({ value = {}, onChange, full = false }: Props) {
  const fields = full ? FULL_FIELDS : DEFAULT_FIELDS;

  return (
    <FormRow style={{ gap: "0.5rem", flexWrap: "wrap" }}>
      {fields.map((field) => (
        <FormField key={field.key} style={{ minWidth: "180px" }}>
          <FieldLabel>{field.label}</FieldLabel>
          <Input
            type="number"
            min={0}
            value={value[field.key] ?? ""}
            onChange={(event) => {
              onChange({
                ...value,
                [field.key]: event.target.value === "" ? undefined : Number(event.target.value),
              });
            }}
          />
        </FormField>
      ))}
    </FormRow>
  );
}
