import styled from "styled-components";
import { inputControlStyles } from "./FormControls.styled";

const StyledInput = styled.input`${inputControlStyles}`;

export default function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <StyledInput {...props} />;
}
