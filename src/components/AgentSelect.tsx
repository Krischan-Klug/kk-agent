import { useState, useRef, useEffect } from "react";
import styled from "styled-components";
import type { AgentDefinition } from "@/types/api";

const Wrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const Trigger = styled.button`
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 2px var(--space-sm);
  background: var(--accent-muted);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: var(--accent);
    color: var(--bg-base);
  }

  &::after {
    content: "▼";
    font-size: 8px;
    opacity: 0.7;
  }
`;

const Dropdown = styled.div<{ $direction: "up" | "down" }>`
  position: absolute;
  ${({ $direction }) => ($direction === "up" ? "bottom: calc(100% + 4px);" : "top: calc(100% + 4px);")}
  left: 0;
  z-index: 1000;
  min-width: 220px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
`;

const Option = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: ${(p) => (p.$active ? "var(--accent-muted)" : "transparent")};
  color: var(--text-primary);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-sm);
  text-align: left;

  &:hover {
    background: var(--bg-hover);
  }
`;

const OptionName = styled.span<{ $active: boolean }>`
  font-weight: 500;
  &::after {
    content: "${(p) => (p.$active ? " ✓" : "")}";
    color: var(--accent);
    font-size: 12px;
  }
`;

const OptionDesc = styled.span`
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
`;

interface AgentSelectProps {
  agents: AgentDefinition[];
  currentAgentId: string;
  onSelect: (agentId: string) => void;
  direction?: "up" | "down";
}

export default function AgentSelect({ agents, currentAgentId, onSelect, direction = "down" }: AgentSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const current = agents.find((a) => a.id === currentAgentId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <Wrapper ref={wrapperRef}>
      <Trigger onClick={() => setOpen(!open)}>
        {current?.name ?? currentAgentId}
      </Trigger>
      {open && (
        <Dropdown $direction={direction}>
          {agents.map((a) => (
            <Option
              key={a.id}
              $active={a.id === currentAgentId}
              onClick={() => {
                onSelect(a.id);
                setOpen(false);
              }}
            >
              <OptionName $active={a.id === currentAgentId}>{a.name}</OptionName>
              {a.description && <OptionDesc>{a.description}</OptionDesc>}
            </Option>
          ))}
        </Dropdown>
      )}
    </Wrapper>
  );
}
