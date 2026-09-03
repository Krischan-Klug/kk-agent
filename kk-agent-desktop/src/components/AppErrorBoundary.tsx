import { Component, type ErrorInfo, type ReactNode } from "react";
import styled from "styled-components";
import Button from "./Button";
import { reportError } from "@/lib/errorReporting";

const Fallback = styled.main`
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  text-align: center;
`;

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError("The application could not be rendered", new Error(`${error.message}\n${info.componentStack ?? ""}`.trim()));
  }

  render() {
    if (this.state.failed) {
      return (
        <Fallback>
          <h1>Something went wrong</h1>
          <p>The current view could not be rendered.</p>
          <Button type="button" onClick={() => window.location.reload()}>Reload application</Button>
        </Fallback>
      );
    }
    return this.props.children;
  }
}
