import {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
} from "./schema.js";
import { CONTROL_RUNTIME_COVERAGE } from "./runtime.js";
import { isVisualizationMethod } from "../visualization/types.js";
import { getParameterAutomationDefinitionIssues } from "./automation.js";

const CONTROL_TARGET_TYPE_SET = new Set(Object.values(CONTROL_TARGET_TYPES));
const CONTROL_HANDLER_SET = new Set(Object.values(CONTROL_HANDLERS));
const CONTROL_STATUS_SET = new Set(Object.values(CONTROL_STATUSES));

export function auditControlSchema(
  definitions = CONTROL_DEFINITIONS,
  runtimeCoverage = CONTROL_RUNTIME_COVERAGE,
) {
  const issues = [];
  const keys = new Set();
  const schemaHandlers = new Set(
    definitions.map((definition) => definition.handler),
  );
  const runtimeCoverageByHandler = new Map(
    Object.entries(runtimeCoverage).map(([handler, coveredKeys]) => [
      handler,
      new Set(coveredKeys),
    ]),
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
    if (!CONTROL_TARGET_TYPE_SET.has(definition.targetType)) {
      issues.push(`Control ${definition.key} has invalid targetType`);
    }
    if (!CONTROL_HANDLER_SET.has(definition.handler)) {
      issues.push(`Control ${definition.key} has invalid handler`);
    }
    if (!CONTROL_STATUS_SET.has(definition.status)) {
      issues.push(`Control ${definition.key} has invalid status`);
    }
    issues.push(...getParameterAutomationDefinitionIssues(definition));
    if (!Array.isArray(definition.methods) || definition.methods.length === 0) {
      issues.push(`Control ${definition.key} is missing visualization methods`);
      continue;
    }
    if (!definition.methods.every((method) => isVisualizationMethod(method))) {
      issues.push(
        `Control ${definition.key} has invalid visualization methods`,
      );
    }
    const coveredKeys = runtimeCoverageByHandler.get(definition.handler);
    if (!coveredKeys?.has(definition.key)) {
      issues.push(`Control ${definition.key} is missing runtime coverage`);
    }
  }

  for (const [handler, coveredKeys] of runtimeCoverageByHandler) {
    for (const key of coveredKeys) {
      const definition = definitions.find((candidate) => candidate.key === key);
      if (!definition) {
        issues.push(
          `Runtime coverage ${handler}.${key} has no control definition`,
        );
        continue;
      }
      if (definition.handler !== handler) {
        issues.push(
          `Runtime coverage ${handler}.${key} conflicts with schema handler ${definition.handler}`,
        );
      }
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
