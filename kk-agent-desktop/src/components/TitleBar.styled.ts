import styled from "styled-components";

export const TitleBarWrapper = styled.header`
  position: relative;
  z-index: 100;
  display: flex;
  align-items: center;
  width: 100%;
  height: 42px;
  flex: 0 0 42px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  user-select: none;
  -webkit-app-region: drag;
`;

export const TitleBarBrand = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 0 16px;
  pointer-events: none;

  svg {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    stroke: var(--accent);
    stroke-linecap: square;
    stroke-linejoin: miter;
    stroke-width: 1.7;
  }
`;

export const TitleBarDragArea = styled.div`
  min-width: 24px;
  height: 100%;
  flex: 1;
`;

export const WindowControlButton = styled.button<{ $close?: boolean }>`
  display: grid;
  width: 30px;
  height: 22px;
  place-items: center;
  padding: 0;
  margin-right: 2px;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: default;
  -webkit-app-region: no-drag;
  transition: color 100ms ease, background 100ms ease;

  &:last-child {
    margin-right: 6px;
  }

  svg {
    width: 11px;
    height: 11px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: square;
    stroke-width: 1.15;
  }

  &:hover {
    color: var(--text-primary);
    background: ${(props) => (props.$close ? "#c42b1c" : "rgba(108, 138, 255, 0.18)")};
  }

  &:active {
    background: ${(props) => (props.$close ? "#a51d13" : "var(--accent-muted)")};
  }

  &:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -2px;
  }
`;
