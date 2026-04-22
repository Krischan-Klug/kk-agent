import type { ModeBehavior } from "@/types/api";
import { ModeTab, ModeTabs } from "@/components/settings/defaults.styled";

interface Props {
  modes: ModeBehavior[];
  selected: ModeBehavior;
  onSelect: (mode: ModeBehavior) => void;
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
