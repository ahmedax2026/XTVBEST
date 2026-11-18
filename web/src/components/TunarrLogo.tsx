import type { SVGProps } from 'react';

// Kept at the original import path for compatibility with existing screens.
export default function StudioMark(props: SVGProps<SVGElement>) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={props.style}
      aria-label="XBEST"
    >
      <image
        href={`${import.meta.env.BASE_URL}xbest.png`}
        width="64"
        height="64"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}
