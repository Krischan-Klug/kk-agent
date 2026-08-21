import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";
import {
  TitleBarBrand,
  TitleBarDragArea,
  TitleBarWrapper,
  WindowControlButton,
} from "./TitleBar.styled";

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const controls = window.kkAgentDesktop?.windowControls;
    if (!controls) return;

    let mounted = true;
    void controls.isMaximized().then((nextMaximized) => {
      if (mounted) setMaximized(nextMaximized);
    });
    const unsubscribe = controls.onMaximizedChange(setMaximized);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  function toggleMaximize() {
    void window.kkAgentDesktop?.windowControls.toggleMaximize().then(setMaximized);
  }

  return (
    <TitleBarWrapper onDoubleClick={toggleMaximize}>
      <TitleBarBrand>
        <BrandMark />
      </TitleBarBrand>
      <TitleBarDragArea />
      <WindowControlButton
        type="button"
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void window.kkAgentDesktop?.windowControls.minimize()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1.5 6.5h9" />
        </svg>
      </WindowControlButton>
      <WindowControlButton
        type="button"
        aria-label={maximized ? "Restore window" : "Maximize window"}
        title={maximized ? "Restore" : "Maximize"}
        onClick={toggleMaximize}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {maximized ? (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 3.5V1.5h7v7h-2M1.5 3.5h7v7h-7z" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" />
          </svg>
        )}
      </WindowControlButton>
      <WindowControlButton
        $close
        type="button"
        aria-label="Close window"
        title="Close"
        onClick={() => void window.kkAgentDesktop?.windowControls.close()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2 2 8 8M10 2 2 10" />
        </svg>
      </WindowControlButton>
    </TitleBarWrapper>
  );
}
