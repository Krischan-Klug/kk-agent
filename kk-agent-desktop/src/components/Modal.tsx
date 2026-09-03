import { useEffect, useId, useRef } from "react";
import { Overlay, ModalBox, ModalHeader, CloseButton } from "./Modal.styled";

interface ModalProps {
  title: string;
  onClose: () => void;
  showClose?: boolean;
  children: React.ReactNode;
}

export default function Modal({ title, onClose, showClose = true, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && showClose) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, showClose]);

  return (
    <Overlay onClick={onClose}>
      <ModalBox ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3 id={titleId}>{title}</h3>
          {showClose ? <CloseButton type="button" aria-label="Close" onClick={onClose}>&times;</CloseButton> : null}
        </ModalHeader>
        {children}
      </ModalBox>
    </Overlay>
  );
}
