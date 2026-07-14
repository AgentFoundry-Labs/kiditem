import { describe, expect, it, vi } from 'vitest';
import { Sourcing1688TrendExtensionController } from '../sourcing-1688-trend-extension.controller';

describe('Sourcing1688TrendExtensionController', () => {
  it('uses server-derived organization scope for an extension result batch', async () => {
    const trends = {
      ingest1688ExtensionResults: vi.fn().mockResolvedValue({
        businessDate: '2026-07-13',
        collected: 1,
        errors: [],
      }),
    };
    const controller = new Sourcing1688TrendExtensionController(trends as never);
    const body = {
      runId: 'run-1',
      keywords: [{ keyword: '文具', items: [{ offerId: 'offer-1', rank: 1 }] }],
      errors: [],
    };

    const result = await controller.ingest1688Results(body, 'org-1');

    expect(trends.ingest1688ExtensionResults).toHaveBeenCalledWith('org-1', body);
    expect(result).toEqual({ businessDate: '2026-07-13', collected: 1, errors: [] });
  });
});
