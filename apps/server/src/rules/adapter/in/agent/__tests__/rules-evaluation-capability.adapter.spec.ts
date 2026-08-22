import { describe, expect, it, vi } from 'vitest';
import { RulesEvaluationCapabilityAdapter } from '../rules-evaluation-capability.adapter';
import { officialCapabilityExecution } from '../../../../../agent-os/test-helpers/official-capability-execution';

describe('RulesEvaluationCapabilityAdapter', () => {
  it('registers a typed Rules result capability without legacy execution lineage', async () => {
    const registry = { register: vi.fn() };
    const results = {
      apply: vi.fn().mockResolvedValue({ productCount: 1, violationCount: 0, criticalCount: 0 }),
    };
    const adapter = new RulesEvaluationCapabilityAdapter(registry as never, results as never);

    adapter.onModuleInit();
    const handler = registry.register.mock.calls[0][0];
    const output = await handler.execute(officialCapabilityExecution({
        operationId: '11111111-1111-1111-1111-111111111111',
        products: [{
          masterId: '22222222-2222-2222-2222-222222222222', healthScore: 80, violations: [],
        }],
      }) as never);

    expect(handler.key).toBe('rules.apply_evaluation_result');
    expect(handler.idempotencyKey(officialCapabilityExecution({
      operationId: '11111111-1111-1111-1111-111111111111', products: [],
    }) as never)).toBe('00000000-0000-4000-8000-000000000001:rules.apply_evaluation_result:11111111-1111-1111-1111-111111111111');
    expect(results.apply).toHaveBeenCalledWith({
      organizationId: 'org-1',
      operationId: '11111111-1111-1111-1111-111111111111',
      products: expect.any(Array),
    });
    expect(output).toEqual(expect.objectContaining({
      resourceType: 'operation_run',
      resourceId: '11111111-1111-1111-1111-111111111111',
    }));
  });
});
