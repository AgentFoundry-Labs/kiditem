import { PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { WingTrackedProductController } from '../wing-tracked-product.controller';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('WingTrackedProductController bulk history', () => {
  it('declares the static history route before parameter routes and forwards only current organization scope', async () => {
    const service = {
      getBulkHistory: vi.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new WingTrackedProductController(service as never);
    const methods = Object.getOwnPropertyNames(WingTrackedProductController.prototype);

    expect(methods.indexOf('historyBulk')).toBeGreaterThan(-1);
    expect(methods.indexOf('historyBulk')).toBeLessThan(methods.indexOf('remove'));
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        WingTrackedProductController.prototype.historyBulk,
      ),
    ).toBe('history');

    await expect(controller.historyBulk({ days: 30 }, ORGANIZATION_ID))
      .resolves.toEqual({ items: [] });
    expect(service.getBulkHistory).toHaveBeenCalledWith(30, ORGANIZATION_ID);
    expect(service.getBulkHistory).toHaveBeenCalledTimes(1);
  });
});

describe('WingTrackedProductController browser operation snapshots', () => {
  it('exposes the exact run-scoped route and forwards current organization plus attempt token', async () => {
    const service = {
      ingestBrowserSnapshots: vi.fn().mockResolvedValue({ captured: 1, ignored: 0 }),
    };
    const controller = new WingTrackedProductController(service as never);
    expect(Reflect.getMetadata(
      PATH_METADATA,
      WingTrackedProductController.prototype.ingestBrowserSnapshots,
    )).toBe('browser-operations/:runId/snapshots');

    const body = { items: [{ productId: 'wing-1', sourceKeyword: 'A Pencil' }] };
    await expect(controller.ingestBrowserSnapshots(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      body as never,
      ORGANIZATION_ID,
    )).resolves.toEqual({ captured: 1, ignored: 0 });
    expect(service.ingestBrowserSnapshots).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      operationRunId: '22222222-2222-4222-8222-222222222222',
      attemptToken: '33333333-3333-4333-8333-333333333333',
      items: [expect.objectContaining({ productId: 'wing-1', sourceKeyword: 'A Pencil' })],
    });
  });
});
