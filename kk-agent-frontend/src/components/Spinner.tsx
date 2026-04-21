import { SpinnerCircle } from "./Spinner.styled";

export default function Spinner({ size }: { size?: number }) {
  return <SpinnerCircle $size={size} />;
}
