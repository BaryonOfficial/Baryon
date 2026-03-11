/**
 * @typedef {'idle' | 'decay' | 'active' | 'test'} FieldState
 */

/** @type {{ idle: FieldState, decay: FieldState, active: FieldState, test: FieldState }} */
export const FIELD_STATES = Object.freeze({
  idle: "idle",
  decay: "decay",
  active: "active",
  test: "test",
});

export const FIELD_STATE_VALUES = Object.freeze({
  idle: 0,
  decay: 1,
  active: 2,
  test: 3,
});

export function isFieldDrivenState(fieldState) {
  return (
    fieldState === FIELD_STATES.decay ||
    fieldState === FIELD_STATES.active ||
    fieldState === FIELD_STATES.test
  );
}
