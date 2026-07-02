import {
  OperatorDecisionSchema,
  type OperatorDecision,
} from '@kiditem/shared/agent-os';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';

function findJsonObjectEnd(input: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return -1;
      }
    }
  }

  return -1;
}

function stripNullProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullProperties);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== null)
        .map(([key, entry]) => [key, stripNullProperties(entry)]),
    );
  }
  return value;
}

function normalizeSchemaShapedDecision(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') {
    return parsed;
  }
  const record = parsed as Record<string, unknown>;
  if (record.decisionType === 'delegate') {
    return stripNullProperties({
      decisionType: record.decisionType,
      targetAgentType: record.targetAgentType,
      playbookKey: record.playbookKey,
      taskInput: record.taskInput,
      userVisibleRationale: record.userVisibleRationale,
    });
  }
  if (record.decisionType === 'ask_user') {
    return stripNullProperties({
      decisionType: record.decisionType,
      question: record.question,
      reason: record.reason,
    });
  }
  if (record.decisionType === 'refuse') {
    return stripNullProperties({
      decisionType: record.decisionType,
      reason: record.reason,
    });
  }
  return parsed;
}

export class OperatorDecisionParser {
  parse(rawOutput: string): OperatorDecision {
    const trimmed = rawOutput.trim();
    if (!trimmed.startsWith('{')) {
      throw new AgentOsRuntimeError(
        'operator_decision_invalid_json',
        'Operator decision must be one strict JSON object.',
      );
    }

    const endIndex = findJsonObjectEnd(trimmed);
    if (endIndex < 0) {
      throw new AgentOsRuntimeError(
        'operator_decision_invalid_json',
        'Operator decision must be valid JSON.',
      );
    }

    const trailing = trimmed.slice(endIndex + 1).trim();
    if (trailing.length > 0) {
      throw new AgentOsRuntimeError(
        'operator_decision_multiple_json',
        'Operator decision output must contain exactly one JSON object.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new AgentOsRuntimeError(
        'operator_decision_invalid_json',
        'Operator decision must be valid JSON.',
      );
    }

    const decision = OperatorDecisionSchema.safeParse(
      normalizeSchemaShapedDecision(parsed),
    );
    if (!decision.success) {
      throw new AgentOsRuntimeError(
        'operator_decision_schema_invalid',
        decision.error.issues.map((issue) => issue.message).join('; '),
      );
    }

    return decision.data;
  }
}
