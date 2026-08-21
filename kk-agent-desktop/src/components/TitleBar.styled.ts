import styled from "styled-components";

export const TitleBarWrapper = styled.header`
  position: relative;
  z-index: 100;
  display: flex;
  align-items: center;
  width: 100%;
  height: 48px;
  flex: 0 0 48px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 3px 18px rgba(0, 0, 0, 0.22);
  user-select: none;
  -webkit-app-region: drag;
`;

export const TitleBarBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  height: 100%;
  padding: 0 16px;
  pointer-events: none;

  svg {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    stroke: var(--accent);
    stroke-linecap: square;
    stroke-linejoin: miter;
    stroke-width: 1.7;
  }
`;

export const TitleBarIdentity = styled.span`
  display: flex;
  align-items: baseline;
  gap: 9px;
  min-width: 0;
`;

export const TitleBarName = styled.span`
  overflow: hidden;
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.11em;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
`;

export const TitleBarDragArea = styled.div`
  min-width: 24px;
  height: 100%;
  flex: 1;
`;

export const WindowControls = styled.div`
  display: flex;
  align-items: center;
  align-self: center;
  height: 32px;
  gap: 3px;
  margin-right: 8px;
  padding: 3px;
  background: rgba(10, 10, 10, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 9px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
  -webkit-app-region: no-drag;
`;

export const WindowControlButton = styled.button<{ $close?: boolean }>`
  display: grid;
  width: 34px;
  height: 24px;
  place-items: center;
  padding: 0;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: default;
  -webkit-app-region: no-drag;
  transition: color 100ms ease, background 100ms ease;

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
