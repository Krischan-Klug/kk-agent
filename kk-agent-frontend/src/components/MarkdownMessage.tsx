import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styled from "styled-components";
import CodeBlock from "@/components/CodeBlock";

const Wrapper = styled.div`
  color: var(--text-primary);
  line-height: 1.75;

  > * + * {
    margin-top: var(--space-md);
  }

  p {
    margin: 0;
    white-space: pre-wrap;
  }

  ul,
  ol {
    margin: var(--space-sm) 0;
    padding-left: 1.5rem;
  }

  ul ul,
  ul ol,
  ol ul,
  ol ol {
    margin-top: var(--space-xs);
    margin-bottom: 0;
  }

  li {
    padding-left: 2px;
  }

  li + li {
    margin-top: var(--space-xs);
  }

  h1,
  h2,
  h3,
  h4 {
    margin: var(--space-lg) 0 var(--space-sm);
    line-height: 1.35;
    color: var(--text-primary);
  }

  h1:first-child,
  h2:first-child,
  h3:first-child,
  h4:first-child {
    margin-top: 0;
  }

  h1 {
    font-size: 1.25rem;
  }

  h2 {
    font-size: 1.125rem;
  }

  h3,
  h4 {
    font-size: 1rem;
  }

  blockquote {
    margin: var(--space-md) 0;
    padding-left: var(--space-md);
    border-left: 3px solid var(--accent);
    color: var(--text-secondary);
  }

  a {
    color: var(--accent);
    text-decoration: underline;
    word-break: break-word;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    display: block;
    overflow-x: auto;
    margin: var(--space-md) 0;
  }

  th,
  td {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    text-align: left;
  }

  th {
    background: var(--bg-elevated);
  }
`;

const SimpleBlock = styled.pre`
  margin: var(--space-xs) 0;
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
`;

const InlineCode = styled.code`
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--accent-hover);
  word-break: break-word;
`;

interface MarkdownMessageProps {
  content: string;
}

type CodeProps = ComponentProps<"code"> & {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  node?: unknown;
};

export default function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <Wrapper>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const codeEl = Array.isArray(children) ? children[0] : children;
            if (
              !codeEl ||
              typeof codeEl !== "object" ||
              !("props" in codeEl)
            ) {
              return <pre>{children}</pre>;
            }
            const className =
              (codeEl as React.ReactElement<CodeProps>).props?.className ?? "";
            const rawChildren =
              (codeEl as React.ReactElement<CodeProps>).props?.children;
            const code = String(rawChildren ?? "").replace(/\n$/, "");
            const match = /language-([\w-]+)/.exec(className);

            if (match || code.includes("\n")) {
              return <CodeBlock code={code} language={match?.[1]} />;
            }
            return <SimpleBlock>{code}</SimpleBlock>;
          },
          code(props: CodeProps) {
            const { children, node, ...rest } = props;
            void node;
            return <InlineCode {...rest}>{children}</InlineCode>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Wrapper>
  );
}
