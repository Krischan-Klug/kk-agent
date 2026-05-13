import styled from "styled-components";
import { inputControlStyles } from "./FormControls.styled";

export const StyledTextArea = styled.textarea`
  ${inputControlStyles}
  resize: vertical;
  min-height: 80px;
`;
