import { useState } from "react";
import Input from "@/components/Input";
import Button from "@/components/Button";
import { ActionsRow, FormRow } from "@/components/PageForm";

type Props = {
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  sensitiveValues?: boolean;
};

const SENSITIVE_KEY_PATTERN = /(token|key|secret|password)/i;

function getNextKey(values: Record<string, string>): string {
  return `VAR_${Object.keys(values).length + 1}`;
}

export default function KeyValueEditor({
  values,
  onChange,
  addLabel = "+ Variable",
  keyPlaceholder = "KEY",
  valuePlaceholder = "Value",
  sensitiveValues = false,
}: Props) {
  const entries = Object.entries(values);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(() => new Set());

  return (
    <>
      {entries.map(([key, value]) => {
        const sensitiveKey = SENSITIVE_KEY_PATTERN.test(key);
        const canReveal = sensitiveValues && !sensitiveKey;
        const revealed = canReveal && revealedKeys.has(key);
        const hidden = sensitiveValues && !revealed;

        return (
          <FormRow key={key}>
            <Input
              value={key}
              onChange={(e) => {
                const next = { ...values };
                delete next[key];
                next[e.target.value] = value;
                setRevealedKeys((previous) => {
                  const updated = new Set(previous);
                  updated.delete(key);
                  return updated;
                });
                onChange(next);
              }}
              placeholder={keyPlaceholder}
              style={{ width: 160, fontFamily: "var(--font-mono)", fontSize: "var(--font-size-sm)" }}
            />
            <Input
              type={hidden ? "password" : "text"}
              value={value}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              placeholder={valuePlaceholder}
              style={{ flex: 1 }}
            />
            {canReveal && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRevealedKeys((previous) => {
                    const updated = new Set(previous);
                    if (updated.has(key)) updated.delete(key);
                    else updated.add(key);
                    return updated;
                  });
                }}
              >
                {revealed ? "hide" : "show"}
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const next = { ...values };
                delete next[key];
                setRevealedKeys((previous) => {
                  const updated = new Set(previous);
                  updated.delete(key);
                  return updated;
                });
                onChange(next);
              }}
            >
              x
            </Button>
          </FormRow>
        );
      })}
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
