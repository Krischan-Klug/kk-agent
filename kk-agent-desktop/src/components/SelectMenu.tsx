import styled from "styled-components";
import { useDropdown } from "@/hooks/useDropdown";

export type SelectMenuOption = {
  value: string;
  label: string;
  description?: string;
  color?: string;
};

type TriggerVariant = "accent" | "neutral" | "info" | "warning";
type Direction = "up" | "down";
type Align = "left" | "right";

const Wrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const Trigger = styled.button<{ $variant: TriggerVariant; $optionColor?: string; $compact?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px;
  background: var(--bg-surface);
  color: ${(p) => p.$optionColor
    ? `color-mix(in srgb, ${p.$optionColor} 78%, var(--text-primary))`
    : "var(--text-primary)"};
  border: 1px solid ${(p) => p.$optionColor
    ? `color-mix(in srgb, ${p.$optionColor} 58%, var(--border))`
    : p.$variant === "warning" ? "var(--warning)" : p.$variant === "info" ? "var(--info)" : p.$variant === "neutral" ? "var(--border)" : "var(--accent)"};
  border-radius: var(--radius-md);
  font-size: ${(p) => p.$compact ? "11px" : "var(--font-size-sm)"};
  font-weight: ${(p) => p.$compact ? 700 : 500};
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: var(--bg-hover);
    border-color: ${(p) => p.$optionColor
      ? `color-mix(in srgb, ${p.$optionColor} 72%, var(--border))`
      : "var(--border-focus)"};
  }

  &::after {
    content: "▼";
    font-size: 8px;
    opacity: 0.7;
  }
`;

const Dropdown = styled.div<{ $direction: Direction; $align: Align; $minWidth?: string }>`
  position: absolute;
  ${({ $direction }) => ($direction === "up" ? "bottom: calc(100% + 4px);" : "top: calc(100% + 4px);")}
  ${({ $align }) => ($align === "right" ? "right: 0;" : "left: 0;")}
  z-index: 1000;
  min-width: ${(p) => p.$minWidth ?? "200px"};
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
`;

const Option = styled.button<{ $active: boolean; $mono?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: calc(100% - 4px);
  margin: 2px;
  padding: 2px var(--space-sm);
  background: ${(p) => p.$active ? "var(--bg-hover)" : "transparent"};
  color: var(--text-primary);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
  text-align: left;
  font-family: ${(p) => (p.$mono ? "var(--font-mono)" : "inherit")};

  &:hover {
    background: var(--bg-hover);
  }
`;

const OptionTitle = styled.span<{ $active: boolean; $color?: string }>`
  font-weight: 500;
  color: ${(p) => p.$color
    ? `color-mix(in srgb, ${p.$color} 72%, var(--text-primary))`
    : "inherit"};

  &::after {
    content: "${(p) => (p.$active ? " ✓" : "")}";
    color: var(--text-muted);
    font-size: 12px;
    display: none;
  }
`;

const OptionDescription = styled.span`
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
`;

type Props = {
  value: string;
  options: SelectMenuOption[];
  onSelect: (value: string) => void;
  direction?: Direction;
  align?: Align;
  minWidth?: string;
  variant?: TriggerVariant;
  mono?: boolean;
  compact?: boolean;
};

export default function SelectMenu({
  value,
  options,
  onSelect,
  direction = "down",
  align = "left",
  minWidth,
  variant = "accent",
  mono = false,
  compact = false,
}: Props) {
  const { open, ref, toggle, close } = useDropdown<HTMLDivElement>();
  const active = options.find((option) => option.value === value) ?? options[0];

  return (
    <Wrapper ref={ref}>
      <Trigger type="button" $variant={variant} $optionColor={active?.color} $compact={compact} onClick={toggle}>
        {active?.label ?? value}
      </Trigger>
      {open && (
        <Dropdown $direction={direction} $align={align} $minWidth={minWidth}>
          {options.map((option) => (
            <Option
              key={option.value}
              type="button"
              $active={option.value === value}
              $mono={mono}
              onClick={() => {
                onSelect(option.value);
                close();
              }}
            >
              <OptionTitle $active={option.value === value} $color={option.color}>
                {option.label}
              </OptionTitle>
              {option.description && <OptionDescription>{option.description}</OptionDescription>}
            </Option>
          ))}
        </Dropdown>
      )}
    </Wrapper>
  );
}
