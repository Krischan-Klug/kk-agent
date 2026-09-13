import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_SCROLL_THRESHOLD = 48;
const scrollStateBySession = new Map<string, { scrollTop: number; shouldAutoScroll: boolean }>();

export function isNearChatBottom(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  return input.scrollHeight - (input.scrollTop + input.clientHeight) < AUTO_SCROLL_THRESHOLD;
}

export function useChatAutoScroll(sessionId?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [hasUnseenContent, setHasUnseenContent] = useState(false);

  const persistScrollState = useCallback(() => {
    if (!sessionId || !ref.current) return;
    scrollStateBySession.set(sessionId, {
      scrollTop: ref.current.scrollTop,
      shouldAutoScroll: shouldAutoScrollRef.current,
    });
  }, [sessionId]);

  useEffect(() => {
    const saved = sessionId ? scrollStateBySession.get(sessionId) : undefined;
    shouldAutoScrollRef.current = saved?.shouldAutoScroll ?? true;
    setHasUnseenContent(false);

    const frame = window.requestAnimationFrame(() => {
      if (!ref.current) return;
      if (saved) {
        ref.current.scrollTop = saved.scrollTop;
        return;
      }
      if (shouldAutoScrollRef.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      persistScrollState();
    };
  }, [persistScrollState, sessionId]);

  const scrollToBottom = useCallback(() => {
    if (!ref.current) return;
    if (!shouldAutoScrollRef.current) {
      setHasUnseenContent(true);
      return;
    }
    ref.current.scrollTop = ref.current.scrollHeight;
    setHasUnseenContent(false);
    persistScrollState();
  }, [persistScrollState]);

  const jumpToLatest = useCallback(() => {
    if (!ref.current) return;
    shouldAutoScrollRef.current = true;
    ref.current.scrollTop = ref.current.scrollHeight;
    setHasUnseenContent(false);
    persistScrollState();
  }, [persistScrollState]);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    shouldAutoScrollRef.current = isNearChatBottom({ scrollTop, scrollHeight, clientHeight });
    if (shouldAutoScrollRef.current) setHasUnseenContent(false);
    persistScrollState();
  }, [persistScrollState]);

  return {
    ref,
    scrollToBottom,
    jumpToLatest,
    handleScroll,
    hasUnseenContent,
  };
}
