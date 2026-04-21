import styled from "styled-components";

export const ToggleWrapper = styled.label`
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
`;

export const ToggleInput = styled.input`
  opacity: 0;
  width: 0;
  height: 0;

  &:checked + span {
    background: var(--success);
  }

  &:checked + span::before {
    transform: translateX(16px);
  }
`;

export const ToggleSlider = styled.span`
  position: absolute;
  inset: 0;
  background: var(--bg-hover);
  border-radius: 10px;
  transition: background 0.2s ease;

  &::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }
`;
