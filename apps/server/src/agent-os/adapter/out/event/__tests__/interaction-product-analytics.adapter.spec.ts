import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InteractionProductAnalyticsAdapter } from '../interaction-product-analytics.adapter';

const input = {
  event: 'interaction_run_finished' as const,
  organizationId: 'organization-raw-id',
  sessionId: 'session-1',
  executionId: 'execution-1',
  agentDefinitionKey: 'operator',
  surface: 'global_panel' as const,
  durationMs: 1_200,
  outcome: 'completed' as const,
  rendererKinds: ['metric_group'] as const,
};

describe('InteractionProductAnalyticsAdapter', () => {
  it('emits only bounded metadata and a dedicated HMAC organization identity', async () => {
    const emit = vi.fn().mockResolvedValue(undefined);
    const adapter = new InteractionProductAnalyticsAdapter('analytics-hmac-key-with-at-least-32-bytes', emit);

    await expect(adapter.record(input)).resolves.toBe(true);

    expect(emit).toHaveBeenCalledWith({
      event: 'interaction_run_finished',
      organizationHash: createHmac('sha256', 'analytics-hmac-key-with-at-least-32-bytes')
        .update('organization-raw-id')
        .digest('hex'),
      sessionId: 'session-1',
      executionId: 'execution-1',
      agentDefinitionKey: 'operator',
      surface: 'global_panel',
      durationMs: 1_200,
      outcome: 'completed',
      rendererKinds: ['metric_group'],
    });
    expect(JSON.stringify(emit.mock.calls[0]?.[0])).not.toContain('organization-raw-id');
  });

  it.each([
    ['message text', { messageText: '아이 메시지 원문' }],
    ['model output', { modelOutput: 'private answer' }],
    ['resource name', { resourceName: '상품명' }],
    ['raw user id', { userId: 'user-raw-id' }],
    ['token', { token: 'secret-token' }],
    ['cookie', { cookie: 'kiditem_session=secret' }],
    ['dashboard payload', { dashboardContext: { filters: { hidden: true } } }],
  ])('rejects %s before emission', async (_label, forbidden) => {
    const emit = vi.fn();
    const adapter = new InteractionProductAnalyticsAdapter('analytics-hmac-key-with-at-least-32-bytes', emit);

    await expect(adapter.record({ ...input, ...forbidden })).rejects.toThrow('INTERACTION_ANALYTICS_INVALID');
    expect(emit).not.toHaveBeenCalled();
  });

  it('keeps analytics sink failure non-authoritative', async () => {
    const adapter = new InteractionProductAnalyticsAdapter(
      'analytics-hmac-key-with-at-least-32-bytes',
      vi.fn().mockRejectedValue(new Error('analytics unavailable')),
    );
    await expect(adapter.record(input)).resolves.toBe(false);
  });
});
