import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

const RulesEvaluationOperationInputSchema = z.object({}).strict();

export const RULES_EVALUATION_OPERATION_KEY = 'rules.evaluate' as const;

export const RULES_EVALUATION_OPERATION: OperationDefinition = {
  key: RULES_EVALUATION_OPERATION_KEY,
  version: 1,
  title: '룰 평가',
  ownerDomain: 'rules',
  engineType: 'domain',
  allowedTriggers: ['dashboard'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: RulesEvaluationOperationInputSchema,
};
