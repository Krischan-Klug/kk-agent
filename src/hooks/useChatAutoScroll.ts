import { useCallback, useEffect, useRef } from "react";

const AUTO_SCROLL_THRESHOLD = 48;
const scrollStateBySession = new Map<string, { scrollTop: number; shouldAutoScroll: boolean }>();

export function useChatAutoScroll(sessionId?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

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
    if (ref.current && shouldAutoScrollRef.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
      persistScrollState();
    }
  }, [persistScrollState]);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    shouldAutoScrollRef.current = scrollHeight - (scrollTop + clientHeight) < AUTO_SCROLL_THRESHOLD;
    persistScrollState();
  }, [persistScrollState]);

  return {
    ref,
    scrollToBottom,
    handleScroll,
  };
}
