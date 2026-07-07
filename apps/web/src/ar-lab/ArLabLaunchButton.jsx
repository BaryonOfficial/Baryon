import { AR_LAB_PATH } from "./arLabRoute.js";
import ArLabMarkIcon from "./ArLabMarkIcon.jsx";

const CSS = `
.ar-lab-launch-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: var(--app-floating-control-size, 2.2rem);
  padding: 0 0.34rem;
  border: 0;
  background: transparent;
  color: var(--nd-accent);
  cursor: pointer;
  user-select: none;
  border-radius: 0.6rem;
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    color 180ms ease,
    box-shadow 180ms ease;
}

.ar-lab-launch-button svg {
  width: 1.6rem;
  height: 1.6rem;
}

.ar-lab-launch-label {
  font-family: var(--baryon-type-interface-family);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--nd-text-display);
}

.ar-lab-launch-button:hover {
  transform: translateY(-1px);
  color: color-mix(in srgb, var(--nd-accent) 78%, #fff);
}

.ar-lab-launch-button:active {
  transform: translateY(0) scale(0.96);
}

.ar-lab-launch-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--nd-accent) 55%, transparent);
}
`;

/**
 * Entry point for the hidden `/ar-lab` route on the main web app. Renders the AR
 * Lab mark (framed 3D box) with an "AR" wordmark beside the advanced-controls
 * trigger via `controlsBrandAccessory` — no pill.
 *
 * @param {{ onSelect?: () => void }} props
 */
export default function ArLabLaunchButton({ onSelect }) {
  const handleSelect =
    onSelect ??
    (() => {
      window.location.assign(AR_LAB_PATH);
    });

  return (
    <>
      <style>{CSS}</style>
      <button
        type="button"
        className="ar-lab-launch-button"
        data-testid="ar-lab-launch-button"
        aria-label="Open Baryon AR Lab"
        onClick={handleSelect}
      >
        <ArLabMarkIcon />
        <span className="ar-lab-launch-label">AR</span>
      </button>
    </>
  );
}
