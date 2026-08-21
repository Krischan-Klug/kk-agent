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

export const ModeTab = styled.button<{ $active: boolean; $variant?: "info" | "warning" }>`
  padding: 6px 10px;
  background: ${({ $active, $variant = "warning" }) => $active
    ? `color-mix(in srgb, var(--${$variant}) 20%, transparent)`
    : "var(--bg-surface)"};
  color: ${({ $variant = "warning" }) => `var(--${$variant})`};
  border: 1px solid ${({ $variant = "warning" }) => `var(--${$variant})`};
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
`;
