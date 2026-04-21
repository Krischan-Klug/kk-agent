import { StyledTextArea } from "./TextArea.styled";

export default function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <StyledTextArea {...props} />;
}
