import styled, { css } from "styled-components";

const variants = {
  primary: css`background: var(--bg-elevated); color: var(--text-primary); border: 1px solid color-mix(in srgb, var(--accent) 58%, var(--border)); &:hover:not(:disabled) { background: var(--bg-hover); }`,
  secondary: css`background: transparent; color: var(--text-primary); border: 1px solid var(--border); &:hover:not(:disabled) { background: var(--bg-hover); }`,
  danger: css`background: transparent; color: var(--danger); border: 1px solid var(--danger); &:hover:not(:disabled) { background: rgba(248, 113, 113, 0.1); }`,
};

const StyledButton = styled.button<{ $variant: keyof typeof variants; $size: "sm" | "md" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: ${({ $size }) => $size === "sm" ? "4px 10px" : "8px 16px"};
  border-radius: var(--radius-md);
  font: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  ${({ $variant }) => variants[$variant]}
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
}

export default function Button({
  variant = "primary",
  size = "md",
  children,
  ...rest
}: ButtonProps) {
  return (
    <StyledButton $variant={variant} $size={size} {...rest}>
      {children}
    </StyledButton>
  );
}
