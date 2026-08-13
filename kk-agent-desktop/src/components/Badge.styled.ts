import styled from "styled-components";

const colorMap: Record<string, { bg: string; text: string }> = {
  success: { bg: "rgba(74, 222, 128, 0.15)", text: "var(--success)" },
  danger: { bg: "rgba(248, 113, 113, 0.15)", text: "var(--danger)" },
  info: { bg: "rgba(96, 165, 250, 0.15)", text: "var(--info)" },
  warning: { bg: "rgba(251, 191, 36, 0.15)", text: "var(--warning)" },
  default: { bg: "var(--bg-elevated)", text: "var(--text-secondary)" },
};

export const BadgePill = styled.span<{ $variant?: string }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: 1.4;
  background: ${(p) => colorMap[p.$variant ?? "default"]?.bg};
  color: ${(p) => colorMap[p.$variant ?? "default"]?.text};
`;
