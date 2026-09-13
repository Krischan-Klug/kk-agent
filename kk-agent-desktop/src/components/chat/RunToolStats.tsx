import styled from "styled-components";
import type { RunToolCallStats } from "kk-agent-contract";

const Wrap = styled.div`
  margin-bottom: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
`;

const Summary = styled.div`
  color: var(--text-primary);
  font-weight: 500;
`;

const Breakdown = styled.div`
  margin-top: var(--space-xs);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
`;

type Props = {
  stats: RunToolCallStats;
};

export default function RunToolStats({ stats }: Props) {
  if (stats.total === 0) return null;

  const statusParts = [`${stats.succeeded}/${stats.total} tool calls succeeded`];
  if (stats.failed > 0) statusParts.push(`${stats.failed} failed`);
  if (stats.pending > 0) statusParts.push(`${stats.pending} pending`);

  return (
    <Wrap aria-label="Authoritative run statistics">
      <Summary>Run protocol (verified) · {statusParts.join(" · ")}</Summary>
      <Breakdown>
        {stats.byTool.map((tool) => `${tool.name} ×${tool.total}`).join(" · ")}
      </Breakdown>
    </Wrap>
  );
}
