import TextArea from "@/components/TextArea";
import type { AppDefaults } from "@/types/api";
import { FieldLabel, FormField } from "@/components/PageForm";

interface Props {
  draft: AppDefaults;
  setDraft: (draft: AppDefaults) => void;
}

export default function MiscSection({ draft, setDraft }: Props) {
  return (
    <>
      <FormField>
        <FieldLabel>Empty Response Retry</FieldLabel>
        <TextArea
          rows={3}
          value={draft.retry.emptyResponseInstruction}
          onChange={(e) => setDraft({
            ...draft,
            retry: { ...draft.retry, emptyResponseInstruction: e.target.value },
          })}
        />
      </FormField>
      <FormField>
        <FieldLabel>Invalid Tool Retry</FieldLabel>
        <TextArea
          rows={3}
          value={draft.retry.invalidToolInstruction}
          onChange={(e) => setDraft({
            ...draft,
            retry: { ...draft.retry, invalidToolInstruction: e.target.value },
          })}
        />
      </FormField>
      <FormField>
        <FieldLabel>Vision Unsupported Instruction</FieldLabel>
        <TextArea
          rows={3}
          value={draft.asset.visionNotSupportedInstruction}
          onChange={(e) => setDraft({
            ...draft,
            asset: { ...draft.asset, visionNotSupportedInstruction: e.target.value },
          })}
        />
      </FormField>
    </>
  );
}
