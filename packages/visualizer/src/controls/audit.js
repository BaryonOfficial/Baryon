import {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
} from "./schema.js";
import { CONTROL_RUNTIME_COVERAGE } from "./runtime.js";
import { isVisualizationMethod } from "../visualization/types.js";

export function auditControlSchema(
  definitions = CONTROL_DEFINITIONS,
  runtimeCoverage = CONTROL_RUNTIME_COVERAGE,
) {
  const issues = [];
  const keys = new Set();
  const schemaHandlers = new Set(
    definitions.map((definition) => definition.handler),
  );

  for (const handler of schemaHandlers) {
    if (!runtimeCoverage[handler]) {
      issues.push(`Handler ${handler} is missing runtime coverage`);
    }
  }

  for (const definition of definitions) {
    if (!definition.key) {
      issues.push("Control is missing key");
      continue;
    }

    if (keys.has(definition.key)) {
      issues.push(`Duplicate control key: ${definition.key}`);
    }
    keys.add(definition.key);

    if (!definition.folder)
      issues.push(`Control ${definition.key} is missing folder`);
    if (!definition.label)
      issues.push(`Control ${definition.key} is missing label`);
    if (!definition.runtimePath)
      issues.push(`Control ${definition.key} is missing runtimePath`);
    if (!Object.values(CONTROL_TARGET_TYPES).includes(definition.targetType)) {
      issues.push(`Control ${definition.key} has invalid targetType`);
    }
    if (!Object.values(CONTROL_HANDLERS).includes(definition.handler)) {
      issues.push(`Control ${definition.key} has invalid handler`);
    }
    if (!Object.values(CONTROL_STATUSES).includes(definition.status)) {
      issues.push(`Control ${definition.key} has invalid status`);
    }
    if (!Array.isArray(definition.methods) || definition.methods.length === 0) {
      issues.push(`Control ${definition.key} is missing visualization methods`);
      continue;
    }
    if (!definition.methods.every((method) => isVisualizationMethod(method))) {
      issues.push(
        `Control ${definition.key} has invalid visualization methods`,
      );
    }
    const coveredKeys = runtimeCoverage[definition.handler];
    if (!coveredKeys?.includes(definition.key)) {
      issues.push(`Control ${definition.key} is missing runtime coverage`);
    }
  }

  return {
    definitions,
    issues,
    liveControls: definitions.filter(
      (definition) => definition.status === CONTROL_STATUSES.live,
    ),
    debugControls: definitions.filter(
      (definition) => definition.status === CONTROL_STATUSES.debugOnly,
    ),
    isValid: issues.length === 0,
  };
}
