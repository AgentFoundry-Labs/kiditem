import { describe, expect, it, vi } from 'vitest';
import { RulesEvaluationOperationHandler } from '../rules-evaluation.operation-handler';
import { RULES_EVALUATION_OPERATION } from '../../../../domain/operation/rules.operations';

describe('RulesEvaluationOperationHandler', () => {
  it('registers the code-owned Rules definition and applies exactly its owner operation result', async () => {
    const registry = { register: vi.fn() };
    const results = {
      evaluateAndApply: vi.fn().mockResolvedValue({ productCount: 2, violationCount: 1, criticalCount: 1 }),
    };
    const handler = new RulesEvaluationOperationHandler(registry as never, results as never);

    handler.onModuleInit();
    const result = await handler.execute({
      runId: 'operation-1',
      organizationId: 'organization-1',
      operationKey: RULES_EVALUATION_OPERATION.key,
      triggerSource: 'dashboard',
      input: {},
      requestedByUserId: 'user-1',
      scheduleId: null,
      parentRunId: null,
      attemptToken: 'attempt',
      signal: new AbortController().signal,
      attempts: 1,
      maxAttempts: 3,
      checkpoint: vi.fn(),
      enterEphemeralFinalization: vi.fn(),
    });

    expect(registry.register).toHaveBeenCalledWith(RULES_EVALUATION_OPERATION, handler);
    expect(results.evaluateAndApply).toHaveBeenCalledTimes(1);
    expect(results.evaluateAndApply).toHaveBeenCalledWith({
      organizationId: 'organization-1', operationId: 'operation-1',
    });
    expect(result).toEqual({
      kind: 'completed',
      result: { productCount: 2, violationCount: 1, criticalCount: 1 },
    });
  });
});
