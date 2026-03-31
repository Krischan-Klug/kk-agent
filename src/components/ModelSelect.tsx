import SelectMenu from "@/components/SelectMenu";

interface ModelSelectProps {
  models: string[];
  currentModel: string;
  onSelect: (model: string) => void;
}

export default function ModelSelect({ models, currentModel, onSelect }: ModelSelectProps) {
  return (
    <SelectMenu
      value={currentModel}
      options={models.map((model) => ({ value: model, label: model }))}
      onSelect={onSelect}
      mono
    />
  );
}
