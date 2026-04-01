import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { FieldLabel, FormField } from "@/components/PageForm";

type Props = {
  open: boolean;
  name: string;
  baseUrl: string;
  apiKey: string;
  onNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onCreate: () => void;
  onClose: () => void;
};

export default function CreateProviderModal(props: Props) {
  if (!props.open) return null;

  return (
    <Modal title="Neuer Provider" onClose={props.onClose}>
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input value={props.name} onChange={(e) => props.onNameChange(e.target.value)} placeholder="z.B. Lokaler LLM Server" autoFocus />
      </FormField>
      <FormField>
        <FieldLabel>Base URL</FieldLabel>
        <Input value={props.baseUrl} onChange={(e) => props.onBaseUrlChange(e.target.value)} />
      </FormField>
      <FormField>
        <FieldLabel>API Key</FieldLabel>
        <Input type="password" value={props.apiKey} onChange={(e) => props.onApiKeyChange(e.target.value)} placeholder="optional" />
      </FormField>
      <Button onClick={props.onCreate} disabled={!props.name.trim() || !props.baseUrl.trim()}>
        Erstellen
      </Button>
    </Modal>
  );
}
