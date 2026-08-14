import { describe, expect, it, vi } from 'vitest';
import { SourcingBrowserTrendOperationController } from '../sourcing-browser-trend-operation.controller';

describe('SourcingBrowserTrendOperationController', () => {
  it('routes 1688 browser results through the fenced owner service with the exact run and attempt token', async () => {
    const trends = {
      ingest1688: vi.fn().mockResolvedValue({
        businessDate: '2026-08-14',
        collected: 1,
        errorCount: 0,
        duplicate: false,
      }),
      ingestTiktokCc: vi.fn(),
    };
    const controller = new SourcingBrowserTrendOperationController(trends as never);
    const body = {
      keywords: [{ keyword: '文具', items: [{ offerId: 'offer-1', rank: 1 }] }],
      errors: [],
    };

    await expect(controller.ingest1688Results(
      '00000000-0000-4000-8000-000000000010',
      body,
      'org-1',
      'attempt-token-1',
    )).resolves.toEqual({
      businessDate: '2026-08-14',
      collected: 1,
      errorCount: 0,
      duplicate: false,
    });

    expect(trends.ingest1688).toHaveBeenCalledWith({
      organizationId: 'org-1',
      operationRunId: '00000000-0000-4000-8000-000000000010',
      attemptToken: 'attempt-token-1',
      batch: body,
    });
  });

  it('keeps TikTok on its own fixed result route rather than accepting an action name from the client', async () => {
    const trends = {
      ingest1688: vi.fn(),
      ingestTiktokCc: vi.fn().mockResolvedValue({
        businessDate: '2026-08-14',
        collected: 2,
        errorCount: 0,
        duplicate: false,
      }),
    };
    const controller = new SourcingBrowserTrendOperationController(trends as never);
    const body = {
      region: 'KR',
      items: [{ trendType: 'keyword', entityKey: 'slime' }],
    };

    await controller.ingestTiktokCcResults(
      '00000000-0000-4000-8000-000000000011',
      body,
      'org-1',
      'attempt-token-2',
    );

    expect(trends.ingestTiktokCc).toHaveBeenCalledWith({
      organizationId: 'org-1',
      operationRunId: '00000000-0000-4000-8000-000000000011',
      attemptToken: 'attempt-token-2',
      batch: body,
    });
  });
});
