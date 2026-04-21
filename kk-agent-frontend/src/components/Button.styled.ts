import styled, { css } from "styled-components";

const variants = {
  primary: css`
    background: var(--accent);
    color: #fff;
    &:hover:not(:disabled) {
      background: var(--accent-hover);
    }
  `,
  secondary: css`
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--border);
    &:hover:not(:disabled) {
      background: var(--bg-hover);
    }
  `,
  danger: css`
    background: transparent;
    color: var(--danger);
    border: 1px solid var(--danger);
    &:hover:not(:disabled) {
      background: rgba(248, 113, 113, 0.1);
    }
  `,
};

export const StyledButton = styled.button<{
  $variant?: keyof typeof variants;
  $size?: "sm" | "md";
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: ${(p) => (p.$size === "sm" ? "4px 10px" : "8px 16px")};
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  ${(p) => variants[p.$variant ?? "primary"]}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
