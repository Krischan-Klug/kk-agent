import styled from "styled-components";
import { useDropdown } from "@/hooks/useDropdown";

export type SelectMenuOption = {
  value: string;
  label: string;
  description?: string;
  color?: string;
};

type TriggerVariant = "accent" | "neutral" | "warning";
type Direction = "up" | "down";
type Align = "left" | "right";

const Wrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const Trigger = styled.button<{ $variant: TriggerVariant; $optionColor?: string }>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-sm);
  background: ${(p) =>
    p.$variant === "warning" ? "rgba(255, 160, 50, 0.12)" : p.$variant === "neutral" ? "var(--bg-surface)" : "var(--accent-muted)"};
  color: ${(p) =>
    p.$optionColor ??
    (p.$variant === "warning" ? "var(--warning)" : p.$variant === "neutral" ? "var(--text-primary)" : "var(--accent)")};
  border: 1px solid ${(p) =>
    p.$optionColor ??
    (p.$variant === "warning" ? "var(--warning)" : p.$variant === "neutral" ? "var(--border)" : "var(--accent)")};
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    ${(p) =>
      p.$optionColor
        ? `border-color: ${p.$optionColor}; background: var(--bg-hover); color: ${p.$optionColor};`
        : p.$variant === "neutral"
        ? "border-color: var(--accent);"
        : "background: var(--accent); color: var(--bg-base); border-color: var(--accent);"}
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
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "transparent")};
  color: var(--text-primary);
  border: none;
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
  color: ${(p) => p.$color ?? "inherit"};

  &::after {
    content: "${(p) => (p.$active ? " ✓" : "")}";
    color: ${(p) => p.$color ?? "var(--accent)"};
    font-size: 12px;
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
}: Props) {
  const { open, ref, toggle, close } = useDropdown<HTMLDivElement>();
  const active = options.find((option) => option.value === value) ?? options[0];

  return (
    <Wrapper ref={ref}>
      <Trigger type="button" $variant={variant} $optionColor={active?.color} onClick={toggle}>
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
