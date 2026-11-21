import type { SVGProps } from "react";

export type SigilProps = SVGProps<SVGSVGElement> & { size?: number | string };

export function Sigil({ size = 38, ...props }: SigilProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 42 44"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M21 2 39 12.4 32.6 16.1 21 9.4 9.4 16.1 3 12.4Z"
        fill="#FF6777"
      />
      <path
        d="m3 12.4 6.4 3.7v5l23.2 13.4L21 41.3 3 30.9l6.4-3.7L21 33.9l.8-.5L3 22.5Z"
        fill="#FF344E"
      />
      <path d="m39 12.4-6.4 3.7v5l-10.8-6.3-6.3 3.7L39 32.1Z" fill="#CE1438" />
    </svg>
  );
}

export default Sigil;
