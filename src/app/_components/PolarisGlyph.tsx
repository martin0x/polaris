// Polaris glyph — four-point north star.
// Brand rule: never skewed, gradient-filled, or recolored outside the accent family.
export function PolarisGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <path
        d="M32 4 L34.6 29.4 L60 32 L34.6 34.6 L32 60 L29.4 34.6 L4 32 L29.4 29.4 Z"
        fill="var(--accent)"
      />
      <circle cx="32" cy="32" r="2.6" fill="var(--paper-0)" />
    </svg>
  );
}
