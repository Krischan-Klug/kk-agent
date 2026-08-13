import { BadgePill } from "./Badge.styled";

interface BadgeProps {
  variant?: "success" | "danger" | "info" | "warning" | "default";
  children: React.ReactNode;
}

export default function Badge({ variant = "default", children }: BadgeProps) {
  return <BadgePill $variant={variant}>{children}</BadgePill>;
}
