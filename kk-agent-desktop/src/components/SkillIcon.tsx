import type { CSSProperties } from "react";

type Props = {
  className?: string;
  style?: CSSProperties;
};

/** The shared visual mark for Agent Skills. */
export default function SkillIcon({ className, style }: Props) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M4 5.5c2.9 0 5.4.5 8 2.2 2.6-1.7 5.1-2.2 8-2.2v13c-2.9 0-5.4.5-8 2.2-2.6-1.7-5.1-2.2-8-2.2v-13Z" />
      <path d="M12 7.7v13M6.5 9.5c1.2.1 2.3.4 3.5 1M17.5 9.5c-1.2.1-2.3.4-3.5 1" />
    </svg>
  );
}
