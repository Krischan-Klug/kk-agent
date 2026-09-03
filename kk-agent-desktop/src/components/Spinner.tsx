import styled, { keyframes } from "styled-components";

const spin = keyframes`to { transform: rotate(360deg); }`;
const SpinnerCircle = styled.div<{ $size?: number }>`
  width: ${({ $size }) => $size ?? 20}px;
  height: ${({ $size }) => $size ?? 20}px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
`;

export default function Spinner({ size }: { size?: number }) {
  return <SpinnerCircle $size={size} />;
}
