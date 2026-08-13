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
