import { ToggleWrapper, ToggleInput, ToggleSlider } from "./Toggle.styled";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <ToggleWrapper style={disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
      <ToggleInput
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <ToggleSlider />
    </ToggleWrapper>
  );
}
