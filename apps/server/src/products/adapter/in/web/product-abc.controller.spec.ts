import { ConflictException } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ProductAbcController } from './product-abc.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('ProductAbcController', () => {
  it('passes only authenticated organization scope and returns SOURCE_NOT_READY as 200 data', async () => {
    const sourceNotReady = {
      outcome: 'SOURCE_NOT_READY' as const,
      publicationRevision: 0,
      officialCutoff: null,
      actualCutoff: '2026-07-31',
      sources: {
        sellpia: {
          ready: false,
          requiredCutoff: '2026-08-31',
          actualCutoff: '2026-07-31',
          latestAttempt: { state: 'COMPLETE' as const },
          latestComplete: { actualCutoff: '2026-07-31' },
        },
        advertising: {
          ready: true,
          requiredCutoff: '2026-08-31',
          actualCutoff: '2026-08-31',
          latestAttempt: { state: 'COMPLETE' as const },
          latestComplete: { actualCutoff: '2026-08-31' },
        },
      },
    };
    const service = {
      recalculate: vi.fn().mockResolvedValue(sourceNotReady),
    };
    const controller = new ProductAbcController(service as never);

    await expect(controller.recalculate(ORGANIZATION_ID)).resolves.toEqual(sourceNotReady);
    expect(service.recalculate).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
  });

  it('maps only INPUT_CHANGED to HTTP 409', async () => {
    const service = {
      recalculate: vi.fn().mockRejectedValue(new ConflictException({ code: 'INPUT_CHANGED' })),
    };
    const controller = new ProductAbcController(service as never);

    await expect(controller.recalculate(ORGANIZATION_ID)).rejects.toMatchObject({
      status: 409,
      response: { code: 'INPUT_CHANGED' },
    });
  });

  it('keeps non-input errors unchanged', async () => {
    const error = new Error('database unavailable');
    const service = { recalculate: vi.fn().mockRejectedValue(error) };
    const controller = new ProductAbcController(service as never);

    await expect(controller.recalculate(ORGANIZATION_ID)).rejects.toBe(error);
  });

  it('publishes POST /api/products/abc/recalculate', () => {
    expect(Reflect.getMetadata('path', ProductAbcController)).toBe('products/abc');
    const handler = ProductAbcController.prototype.recalculate;
    expect(Reflect.getMetadata('path', handler)).toBe('recalculate');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);
  });
});
