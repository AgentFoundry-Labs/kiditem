import { describe, expect, it } from 'vitest';
import { GatewayReadinessService } from './gateway-readiness.service';

describe('GatewayReadinessService', () => {
  it('keeps only the latest process-memory, provider-specific model/effort catalog and clears it on session loss', () => {
    const service = new GatewayReadinessService();
    service.update('gateway-1', [
      {
        runtime: 'codex_cli', ready: true,
        readiness: {
          runtime: 'codex_cli', version: '0.149.1', models: ['gpt-5.6'], reasoningEfforts: ['low', 'xhigh'],
          modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low', 'xhigh'] }],
          loginVerified: true, mcpProtocolRevision: '2026-07-28',
        },
      },
      { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
    ]);

    expect(service.snapshot()).toEqual({
      gatewayInstanceId: 'gateway-1',
      readiness: expect.arrayContaining([expect.objectContaining({ runtime: 'codex_cli', ready: true })]),
    });
    service.clear('gateway-1');
    expect(service.snapshot()).toBeNull();
  });
});
