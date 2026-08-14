import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { SourcingRisingProductController } from '../sourcing-rising-product.controller';

describe('SourcingRisingProductController', () => {
  it('keeps GET latest as a pure persisted read', async () => {
    const rising = {
      getLatest: vi.fn().mockResolvedValue(null),
      detect: vi.fn(),
      latestOrDetect: vi.fn(),
    };
    const operationRunner = { start: vi.fn() };
    const controller = new SourcingRisingProductController(
      rising as never,
      operationRunner as never,
    );

    await expect(controller.latest('org-1')).resolves.toBeNull();
    expect(rising.getLatest).toHaveBeenCalledWith('org-1');
    expect(rising.detect).not.toHaveBeenCalled();
    expect(rising.latestOrDetect).not.toHaveBeenCalled();
    expect(operationRunner.start).not.toHaveBeenCalled();
  });

  it('returns 202 + OperationRun from detect without computing in the request', async () => {
    const rising = { getLatest: vi.fn(), detect: vi.fn() };
    const operationRun = {
      id: 'run-1',
      operationKey: 'sourcing.detect_rising_products',
      status: 'queued',
    };
    const operationRunner = { start: vi.fn().mockResolvedValue(operationRun) };
    const controller = new SourcingRisingProductController(
      rising as never,
      operationRunner as never,
    );

    await expect(controller.detect(
      { windowDays: 14, limit: 100 },
      'org-1',
      ' idem-1 ',
      { id: 'user-1' } as never,
    )).resolves.toBe(operationRun);

    expect(operationRunner.start).toHaveBeenCalledWith({
      organizationId: 'org-1',
      operationKey: 'sourcing.detect_rising_products',
      triggerSource: 'domain_screen',
      input: { windowDays: 14, limit: 100 },
      requestedByUserId: 'user-1',
      idempotencyKey: 'idem-1',
    });
    expect(rising.detect).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(
      HTTP_CODE_METADATA,
      SourcingRisingProductController.prototype.detect,
    )).toBe(HttpStatus.ACCEPTED);
    expect((controller as unknown as { latestOrDetect?: unknown }).latestOrDetect)
      .toBeUndefined();
  });
});
