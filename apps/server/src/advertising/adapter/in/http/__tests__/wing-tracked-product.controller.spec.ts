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

describe('WingTrackedProductController source owner', () => {
  it('exposes the owner route and forwards current organization scope', async () => {
    const service = {
      beginAttempt: vi.fn().mockResolvedValue({ attemptId: 'attempt-1' }),
    };
    const controller = new WingTrackedProductController(service as never);
    expect(Reflect.getMetadata(
      PATH_METADATA,
      WingTrackedProductController.prototype.beginAttempt,
    )).toBe('attempts');

    await expect(controller.beginAttempt(
      { keywords: [' A   Pencil '] },
      ' retry-key ',
      ORGANIZATION_ID,
    )).resolves.toEqual({ attemptId: 'attempt-1' });
    expect(service.beginAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'retry-key',
      keywords: ['A   Pencil'],
    });
  });

  it('requires the owner token and forwards a complete snapshot envelope', async () => {
    const service = {
      submitAttempt: vi.fn().mockResolvedValue({ ready: true }),
    };
    const controller = new WingTrackedProductController(service as never);
    const attemptId = '22222222-2222-4222-8222-222222222222';
    const attemptToken = '33333333-3333-4333-8333-333333333333';
    const body = {
      items: [{ productId: 'wing-1', sourceKeyword: 'A Pencil' }],
    };

    await expect(controller.submitAttempt(
      attemptId,
      attemptToken,
      body,
      ORGANIZATION_ID,
    )).resolves.toEqual({ ready: true });
    expect(service.submitAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      attemptId,
      attemptToken,
      items: [expect.objectContaining({ productId: 'wing-1' })],
    });
  });

  it('rejects a partial terminal envelope instead of accepting per-product failures as complete', () => {
    const controller = new WingTrackedProductController({} as never);
    const attemptId = '22222222-2222-4222-8222-222222222222';
    const attemptToken = '33333333-3333-4333-8333-333333333333';

    expect(() => controller.submitAttempt(
      attemptId,
      attemptToken,
      {
        items: [],
        failures: [{
          productId: 'wing-1',
          code: 'TRACKED_PRODUCT_NOT_FOUND',
          message: 'Product was not found.',
        }],
      },
      ORGANIZATION_ID,
    )).toThrow('INVALID_WING_TRACKED_SNAPSHOT');
  });
});
