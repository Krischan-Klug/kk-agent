import Input from "@/components/Input";
import Button from "@/components/Button";
import { ActionsRow, FormRow } from "@/components/PageForm";

type Props = {
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
};

function getNextKey(values: Record<string, string>): string {
  return `VAR_${Object.keys(values).length + 1}`;
}

export default function KeyValueEditor({
  values,
  onChange,
  addLabel = "+ Variable",
  keyPlaceholder = "KEY",
  valuePlaceholder = "Wert",
}: Props) {
  const entries = Object.entries(values);

  return (
    <>
      {entries.map(([key, value]) => (
        <FormRow key={key}>
          <Input
            value={key}
            onChange={(e) => {
              const next = { ...values };
              delete next[key];
              next[e.target.value] = value;
              onChange(next);
            }}
            placeholder={keyPlaceholder}
            style={{ width: 160, fontFamily: "var(--font-mono)", fontSize: "var(--font-size-sm)" }}
          />
          <Input
            value={value}
            onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            placeholder={valuePlaceholder}
            style={{ flex: 1 }}
          />
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              const next = { ...values };
              delete next[key];
              onChange(next);
            }}
          >
            x
          </Button>
        </FormRow>
      ))}
      <ActionsRow>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange({ ...values, [getNextKey(values)]: "" })}
        >
          {addLabel}
        </Button>
      </ActionsRow>
    </>
  );
}
