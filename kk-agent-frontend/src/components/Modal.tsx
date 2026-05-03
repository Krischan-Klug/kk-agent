import { Overlay, ModalBox, ModalHeader, CloseButton } from "./Modal.styled";

interface ModalProps {
  title: string;
  onClose: () => void;
  showClose?: boolean;
  children: React.ReactNode;
}

export default function Modal({ title, onClose, showClose = true, children }: ModalProps) {
  return (
    <Overlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>{title}</h3>
          {showClose ? <CloseButton onClick={onClose}>&times;</CloseButton> : null}
        </ModalHeader>
        {children}
      </ModalBox>
    </Overlay>
  );
}
