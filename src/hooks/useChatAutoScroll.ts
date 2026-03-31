import { useCallback, useRef } from "react";

export function useChatAutoScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (ref.current && shouldAutoScrollRef.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    shouldAutoScrollRef.current = scrollHeight - (scrollTop + clientHeight) < 48;
  }, []);

  return {
    ref,
    scrollToBottom,
    handleScroll,
  };
}
