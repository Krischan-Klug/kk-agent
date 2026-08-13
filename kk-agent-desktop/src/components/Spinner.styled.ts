import styled, { keyframes } from "styled-components";

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const SpinnerCircle = styled.div<{ $size?: number }>`
  width: ${(p) => p.$size ?? 20}px;
  height: ${(p) => p.$size ?? 20}px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
`;
