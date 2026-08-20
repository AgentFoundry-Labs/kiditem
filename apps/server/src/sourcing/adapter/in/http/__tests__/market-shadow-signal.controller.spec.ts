import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalController } from '../market-shadow-signal.controller';

describe('MarketShadowSignalController', () => {
  it('starts exactly one persisted shadow operation for the authenticated organization', async () => {
    const operations = {
      startShadowCollection: vi.fn(async () => ({
        operationRunId: 'run-1',
        status: 'queued',
      })),
    };
    const service = {
      listRecent: vi.fn(),
    };
    const controller = new MarketShadowSignalController(
      operations as never,
      service as never,
    );

    const result = await controller.collect('org-1', { id: 'user-1' } as never);

    expect(operations.startShadowCollection).toHaveBeenCalledTimes(1);
    expect(operations.startShadowCollection).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      triggerSource: 'domain_screen',
    });
    expect(result).toEqual({ operationRunId: 'run-1', status: 'queued' });
    expect(service.listRecent).not.toHaveBeenCalled();
  });

  it('accepts shadow collection asynchronously instead of executing a provider in the request', () => {
    expect(Reflect.getMetadata(
      HTTP_CODE_METADATA,
      MarketShadowSignalController.prototype.collect,
    )).toBe(HttpStatus.ACCEPTED);
  });

  it('reads a bounded recent window for the authenticated organization', async () => {
    const service = {
      listRecent: vi.fn(async () => [{ id: 'snapshot-1' }]),
    };
    const controller = new MarketShadowSignalController(
      { startShadowCollection: vi.fn() } as never,
      service as never,
    );

    const result = await controller.listRecent({ days: 14 }, 'org-1');

    expect(service.listRecent).toHaveBeenCalledWith('org-1', 14);
    expect(result).toEqual({ snapshots: [{ id: 'snapshot-1' }] });
  });
});
