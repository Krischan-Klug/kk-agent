import FormModal from "@/components/FormModal";
import ProviderFormFields from "./ProviderFormFields";

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
    <FormModal
      title="New Provider"
      onClose={props.onClose}
      onSubmit={props.onCreate}
      submitDisabled={!props.name.trim() || !props.baseUrl.trim()}
    >
      <ProviderFormFields
        name={props.name}
        baseUrl={props.baseUrl}
        apiKey={props.apiKey}
        onNameChange={props.onNameChange}
        onBaseUrlChange={props.onBaseUrlChange}
        onApiKeyChange={props.onApiKeyChange}
        autoFocus
      />
    </FormModal>
  );
}
