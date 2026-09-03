import styled from "styled-components";
import { inputControlStyles } from "./FormControls.styled";

const StyledTextArea = styled.textarea`
  ${inputControlStyles}
  min-height: 80px;
  resize: vertical;
`;

export default function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <StyledTextArea {...props} />;
}
