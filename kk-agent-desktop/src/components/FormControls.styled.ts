import styled, { css } from "styled-components";

const compactSelectStyles = css`
  padding: 6px 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: inherit;
  outline: none;

  &:focus {
    border-color: var(--border-focus);
  }
`;

export const inputControlStyles = css`
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: var(--border-focus);
  }

  &::placeholder {
    color: var(--text-muted);
  }
`;

export const Select = styled.select`
  ${compactSelectStyles}
`;

export const InlineSelect = styled.select`
  ${compactSelectStyles}
  padding: 4px 8px;
  font-size: var(--font-size-xs);
`;

export const InputLikeSelect = styled.select`
  ${inputControlStyles}
`;

export const ModeTabs = styled.div`
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
`;

export const ModeTab = styled.button<{ $active: boolean; $enabled?: boolean; $variant?: "accent" | "info" | "warning"; $color?: string }>`
  padding: 2px var(--space-sm);
  background: ${({ $active, $enabled = true, $variant = "accent", $color }) => !$enabled
    ? "var(--bg-surface)"
    : $active
    ? `color-mix(in srgb, ${$color ?? `var(--${$variant})`} 8%, transparent)`
    : "var(--bg-surface)"};
  color: ${({ $enabled = true }) => $enabled ? "var(--text-primary)" : "var(--text-muted)"};
  border: 1px solid ${({ $enabled = true, $variant = "accent", $color }) => $enabled
    ? `color-mix(in srgb, ${$color ?? `var(--${$variant})`} 58%, var(--border))`
    : "var(--border)"};
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
  opacity: ${({ $enabled = true }) => $enabled ? 1 : 0.6};

  &:hover:not(:disabled) {
    background: ${({ $enabled = true, $variant = "accent", $color }) => $enabled
      ? `color-mix(in srgb, ${$color ?? `var(--${$variant})`} 12%, transparent)`
      : "var(--bg-hover)"};
  }
`;

export const ToggleSwitch = styled.button<{ $active: boolean }>`
  width: 32px;
  height: 18px;
  flex: 0 0 auto;
  position: relative;
  padding: 0;
  background: ${({ $active }) => $active
    ? "color-mix(in srgb, var(--accent) 24%, var(--bg-elevated))"
    : "var(--bg-elevated)"};
  border: 1px solid ${({ $active }) => $active
    ? "color-mix(in srgb, var(--accent) 62%, var(--border))"
    : "var(--border)"};
  border-radius: 999px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-secondary);
    transform: translateX(${({ $active }) => ($active ? "14px" : "0")});
    transition: transform 120ms ease, background 120ms ease;
  }

  &:hover:not(:disabled) {
    border-color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const ToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
`;
