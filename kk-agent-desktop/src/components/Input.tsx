import { StyledInput } from "./Input.styled";

export default function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <StyledInput {...props} />;
}
