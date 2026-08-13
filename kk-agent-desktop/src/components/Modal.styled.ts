import styled from "styled-components";

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

export const ModalBox = styled.div`
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  min-width: 360px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
`;

export const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);

  h3 {
    font-size: var(--font-size-lg);
    font-weight: 600;
  }
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-xl);
  cursor: pointer;
  padding: 4px;
  line-height: 1;

  &:hover {
    color: var(--text-primary);
  }
`;
