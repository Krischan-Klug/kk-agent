import FormModal from "@/components/FormModal";
import Input from "@/components/Input";
import { FieldLabel, FormField, MutedText } from "@/components/PageForm";

type Props = {
  open: boolean;
  name: string;
  onNameChange: (value: string) => void;
  onCreate: () => void;
  onClose: () => void;
};

export default function CreateSkillModal({ open, name, onNameChange, onCreate, onClose }: Props) {
  if (!open) return null;

  return (
    <FormModal
      title="Neuer Skill"
      onClose={onClose}
      onSubmit={onCreate}
      submitLabel="Weiter"
      submitDisabled={!name.trim()}
    >
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="z.B. Repo Analysis"
          autoFocus
        />
        <MutedText>Beschreibung, Instruction und Empfehlungen bearbeitest du danach im Editor.</MutedText>
      </FormField>
    </FormModal>
  );
}
