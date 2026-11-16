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
      aria-label="XBest"
    >
      <rect width="64" height="64" rx="16" fill="#f02c45" />
      <path
        d="M16 16H27L48 48H37L16 16ZM37 16H48L27 48H16L37 16Z"
        fill="white"
      />
    </svg>
  );
}
