import { useEffect, useRef, useState } from "react";

export function useDropdown<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return {
    open,
    ref,
    setOpen,
    toggle: () => setOpen((prev) => !prev),
    close: () => setOpen(false),
  };
}
