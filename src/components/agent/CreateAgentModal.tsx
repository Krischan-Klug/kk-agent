import FormModal from "@/components/FormModal";
import Input from "@/components/Input";
import { FieldLabel, FormField } from "@/components/PageForm";

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
    <FormModal
      title="Neuer Agent"
      onClose={onClose}
      onSubmit={onCreate}
      submitDisabled={!name.trim()}
    >
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="z.B. Coding Agent"
          autoFocus
        />
      </FormField>
    </FormModal>
  );
}
