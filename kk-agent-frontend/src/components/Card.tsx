import { CardWrapper, CardTitle } from "./Card.styled";

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
