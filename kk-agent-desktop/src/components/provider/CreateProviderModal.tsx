import FormModal from "@/components/FormModal";
import ProviderFormFields, { type ProviderFormValue } from "./ProviderFormFields";

type Props = {
  open: boolean;
  value: ProviderFormValue;
  onChange: (value: ProviderFormValue) => void;
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
      submitDisabled={!props.value.name.trim() || !props.value.baseUrl.trim()}
    >
      <ProviderFormFields
        value={props.value}
        onChange={props.onChange}
        autoFocus
      />
    </FormModal>
  );
}
