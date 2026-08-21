import type { SVGProps } from "react";

export default function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m10.5 8.8-3.2 6M13.5 8.8l3.2 6M8 17h8" />
      <circle cx="12" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  );
}
