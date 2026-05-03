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
      title="New Skill"
      onClose={onClose}
      onSubmit={onCreate}
      submitLabel="Continue"
      submitDisabled={!name.trim()}
    >
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Repo Analysis"
          autoFocus
        />
        <MutedText>Description, instruction, and recommendations can be edited afterward in the editor.</MutedText>
      </FormField>
    </FormModal>
  );
}
