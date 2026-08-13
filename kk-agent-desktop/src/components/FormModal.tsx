import type { ReactNode } from "react";
import Modal from "./Modal";
import Button from "./Button";
import Spinner from "./Spinner";
import { ActionsRow } from "./PageForm";

interface FormModalProps {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  submitting?: boolean;
  children: ReactNode;
}

export default function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel = "Erstellen",
  submitDisabled,
  submitting,
  children,
}: FormModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      {children}
      <ActionsRow>
        <Button onClick={onSubmit} disabled={submitDisabled || submitting}>
          {submitting ? <Spinner size={14} /> : submitLabel}
        </Button>
      </ActionsRow>
    </Modal>
  );
}
