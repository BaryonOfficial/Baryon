/**
 * The AR Lab mark: a framed 3D box. Shared by the in-app launch pill and the
 * in-lab brand badge so the two stay visually identical. Inherits size and color
 * from CSS (`currentColor`, `width`/`height` on the svg).
 */
export default function ArLabMarkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 7.2V3.5H7.2" />
      <path d="M16.8 3.5H20.5V7.2" />
      <path d="M20.5 16.8V20.5H16.8" />
      <path d="M7.2 20.5H3.5V16.8" />
      <path d="M12 8.3 15.9 10.45V14.75L12 16.9 8.1 14.75V10.45Z" />
      <path d="M8.1 10.45 12 12.6 15.9 10.45" />
      <path d="M12 12.6V16.9" />
    </svg>
  );
}
