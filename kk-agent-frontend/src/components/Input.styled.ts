import styled from "styled-components";

export const StyledInput = styled.input`
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
