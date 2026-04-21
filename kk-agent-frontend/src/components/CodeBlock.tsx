import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import styled from "styled-components";

const LANG_COLORS: Record<string, string> = {
  javascript: "#f7df1e",
  js: "#f7df1e",
  typescript: "#3178c6",
  ts: "#3178c6",
  python: "#3572a5",
  py: "#3572a5",
  html: "#e34c26",
  css: "#563d7c",
  json: "#8b8b8b",
  bash: "#4eaa25",
  shell: "#4eaa25",
  sh: "#4eaa25",
  go: "#00add8",
  rust: "#dea584",
  java: "#b07219",
  ruby: "#701516",
  sql: "#e38c00",
  yaml: "#cb171e",
  yml: "#cb171e",
  xml: "#0060ac",
  c: "#555555",
  cpp: "#f34b7d",
  jsx: "#f7df1e",
  tsx: "#3178c6",
};

const COLLAPSE_THRESHOLD = 50;
const PREVIEW_LINES = 8;

const Wrapper = styled.div`
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
  margin: var(--space-sm) 0;
  font-size: var(--font-size-sm);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-xs) var(--space-md);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
`;

const LangBadge = styled.span<{ $color: string }>`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${(p) => p.$color};
`;

const CopyBtn = styled.button`
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-sm);
  padding: 2px var(--space-sm);
  border-radius: var(--radius-sm);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
`;

const CodeBody = styled.div<{ $collapsed: boolean }>`
  overflow-x: auto;
  overflow-y: ${(p) => (p.$collapsed ? "hidden" : "auto")};
  max-height: ${(p) => (p.$collapsed ? "none" : "500px")};

  pre {
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }
`;

const ToggleBar = styled.button`
  display: block;
  width: 100%;
  background: var(--bg-elevated);
  border: none;
  border-top: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  text-align: left;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
`;

interface CodeBlockProps {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lines = code.split("\n");
  const isLong = lines.length >= COLLAPSE_THRESHOLD;
  const collapsed = isLong && !expanded;
  const displayCode = collapsed ? lines.slice(0, PREVIEW_LINES).join("\n") : code;
  const langColor = language ? (LANG_COLORS[language.toLowerCase()] ?? "var(--text-muted)") : "";
  const prismLang = language?.toLowerCase() ?? "";

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Wrapper>
      <Header>
        <span>{language ? <LangBadge $color={langColor}>{language}</LangBadge> : <span />}</span>
        <CopyBtn onClick={handleCopy}>{copied ? "Kopiert!" : "Kopieren"}</CopyBtn>
      </Header>
      <CodeBody $collapsed={collapsed}>
        <Highlight theme={themes.vsDark} code={displayCode} language={prismLang}>
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre style={{ ...style, background: "transparent" }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, k) => (
                    <span key={k} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </CodeBody>
      {isLong && (
        <ToggleBar onClick={() => setExpanded(!expanded)}>
          {expanded
            ? "▲ Einklappen"
            : `▼ ${lines.length - PREVIEW_LINES} weitere Zeilen anzeigen`}
        </ToggleBar>
      )}
    </Wrapper>
  );
}
