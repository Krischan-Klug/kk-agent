import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { ActionsRow, FieldLabel, FormField } from "@/components/PageForm";

type Props = {
  open: boolean;
  name: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
  onClose: () => void;
};

export default function CreateAgentModal({ open, name, onNameChange, onCreate, onClose }: Props) {
  if (!open) return null;

  return (
    <Modal title="Neuer Agent" onClose={onClose}>
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="z.B. Coding Agent"
          autoFocus
        />
      </FormField>
      <ActionsRow>
        <Button onClick={onCreate} disabled={!name.trim()}>
          Erstellen
        </Button>
      </ActionsRow>
    </Modal>
  );
}
