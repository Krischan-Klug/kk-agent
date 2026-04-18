import type { ChatMode } from "@/types/api";
import { ModeTab, ModeTabs } from "@/components/settings/defaults.styled";

interface Props {
  modes: ChatMode[];
  selected: ChatMode;
  onSelect: (mode: ChatMode) => void;
  keyPrefix?: string;
}

export default function ModeTabsSelector({ modes, selected, onSelect, keyPrefix }: Props) {
  return (
    <ModeTabs>
      {modes.map((mode) => (
        <ModeTab
          key={keyPrefix ? `${keyPrefix}-${mode}` : mode}
          type="button"
          $active={mode === selected}
          onClick={() => onSelect(mode)}
        >
          {mode}
        </ModeTab>
      ))}
    </ModeTabs>
  );
}
