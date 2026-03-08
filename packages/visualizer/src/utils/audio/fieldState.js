import { FIELD_STATES } from './types.js';

export function deriveFieldState({ injectTestTone, activeModeCount, usedDecay }) {
  const hasModalField = activeModeCount > 0;

  /** @type {import('./types.js').FieldState} */
  let fieldState = FIELD_STATES.idle;
  if (injectTestTone) {
    fieldState = FIELD_STATES.test;
  } else if (hasModalField) {
    fieldState = usedDecay ? FIELD_STATES.decay : FIELD_STATES.active;
  }

  return {
    fieldState,
    hasModalField,
  };
}
