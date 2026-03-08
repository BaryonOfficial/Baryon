import {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
} from "./schema.js";

export function auditControlSchema(definitions = CONTROL_DEFINITIONS) {
  const issues = [];
  const keys = new Set();

  for (const definition of definitions) {
    if (!definition.key) {
      issues.push("Control is missing key");
      continue;
    }

    if (keys.has(definition.key)) {
      issues.push(`Duplicate control key: ${definition.key}`);
    }
    keys.add(definition.key);

    if (!definition.folder) issues.push(`Control ${definition.key} is missing folder`);
    if (!definition.label) issues.push(`Control ${definition.key} is missing label`);
    if (!definition.runtimePath) issues.push(`Control ${definition.key} is missing runtimePath`);
    if (!Object.values(CONTROL_TARGET_TYPES).includes(definition.targetType)) {
      issues.push(`Control ${definition.key} has invalid targetType`);
    }
    if (!Object.values(CONTROL_HANDLERS).includes(definition.handler)) {
      issues.push(`Control ${definition.key} has invalid handler`);
    }
    if (!Object.values(CONTROL_STATUSES).includes(definition.status)) {
      issues.push(`Control ${definition.key} has invalid status`);
    }
  }

  return {
    definitions,
    issues,
    liveControls: definitions.filter((definition) => definition.status === CONTROL_STATUSES.live),
    debugControls: definitions.filter((definition) => definition.status === CONTROL_STATUSES.debugOnly),
    isValid: issues.length === 0,
  };
}
