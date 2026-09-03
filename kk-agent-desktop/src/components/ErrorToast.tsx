import { useEffect, useSyncExternalStore } from "react";
import styled from "styled-components";
import {
  dismissError,
  getErrorNotices,
  isAbortError,
  reportError,
  subscribeToErrors,
  type ErrorNotice,
} from "@/lib/errorReporting";

const EMPTY_NOTICES: ErrorNotice[] = [];

const ToastRegion = styled.div`
  position: fixed;
  right: var(--space-md);
  bottom: var(--space-md);
  z-index: 1000;
  width: min(420px, calc(100vw - 2 * var(--space-md)));
  pointer-events: none;
`;

const Toast = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--space-sm);
  align-items: start;
  padding: 12px;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid color-mix(in srgb, var(--danger) 70%, var(--border));
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
`;

const Icon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--danger);
  border: 1px solid currentColor;
  border-radius: 50%;
  font-weight: 700;
  line-height: 1;
`;

const Copy = styled.div`
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 600;
`;

const Message = styled.div`
  margin-top: 2px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
`;

const QueueHint = styled.div`
  margin-top: var(--space-xs);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
`;

const CloseButton = styled.button`
  padding: 0 4px;
  color: var(--text-secondary);
  background: none;
  border: 0;
  font: inherit;
  font-size: var(--font-size-lg);
  line-height: 1.2;
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
  }
`;

export default function ErrorToast() {
  const notices = useSyncExternalStore(subscribeToErrors, getErrorNotices, () => EMPTY_NOTICES);
  const notice = notices[0];

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      reportError("Unexpected application error", event.error ?? event.message);
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isAbortError(event.reason)) {
        reportError("Unhandled application error", event.reason);
      }
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (!notice) return null;

  const queued = notices.length - 1;
  return (
    <ToastRegion aria-live="assertive" aria-atomic="true">
      <Toast role="alert">
        <Icon aria-hidden="true">!</Icon>
        <Copy>
          <Title>{notice.title}</Title>
          <Message>{notice.message}</Message>
          {(notice.occurrences > 1 || queued > 0) && (
            <QueueHint>
              {notice.occurrences > 1 ? `Occurred ${notice.occurrences} times` : null}
              {notice.occurrences > 1 && queued > 0 ? " · " : null}
              {queued > 0 ? `${queued} more ${queued === 1 ? "error" : "errors"}` : null}
            </QueueHint>
          )}
        </Copy>
        <CloseButton type="button" aria-label="Dismiss error" onClick={() => dismissError(notice.id)}>
          ×
        </CloseButton>
      </Toast>
    </ToastRegion>
  );
}
