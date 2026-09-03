import styled from "styled-components";

const CardWrapper = styled.div`
  padding: var(--space-lg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
`;

const CardTitle = styled.h3`
  margin: 0 0 var(--space-md);
  color: var(--text-primary);
  font-size: var(--font-size-lg);
  font-weight: 600;
`;

interface CardProps {
  title?: string;
  children: React.ReactNode;
}

export default function Card({ title, children }: CardProps) {
  return (
    <CardWrapper>
      {title && <CardTitle>{title}</CardTitle>}
      {children}
    </CardWrapper>
  );
}
