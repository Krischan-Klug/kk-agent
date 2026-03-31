import styled from "styled-components";

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
`;

export const SectionTitle = styled.h3`
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
`;

export const FormRow = styled.div`
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
  flex-wrap: wrap;
`;

export const FormField = styled.div<{ $flex?: number; $minWidth?: string }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: ${(p) => p.$flex ?? "unset"};
  min-width: ${(p) => p.$minWidth ?? "unset"};
`;

export const FieldLabel = styled.label`
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
`;

export const ActionsRow = styled.div`
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
`;

export const MutedText = styled.p`
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
`;

export const SurfaceBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
`;

export const EmptyHint = styled.p`
  margin: 0;
  color: var(--text-secondary);
`;
