import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalController } from '../market-shadow-signal.controller';

const key = '00000000-0000-4000-8000-000000000001';

describe('MarketShadowSignalController', () => {
  it('awaits the source-owner receipt with authenticated scope and the caller key', async () => {
    const receipt = { attemptId: 'attempt-1', state: 'COMPLETE', snapshot: { id: 'snapshot-1' } };
    const service = { collect: vi.fn(async () => receipt) };
    const controller = new MarketShadowSignalController(service as never);
    expect(await controller.collect('org-1', { id: 'user-1' } as never, key, {})).toEqual(receipt);
    expect(service.collect).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org-1', requestedByUserId: 'user-1', idempotencyKey: key,
    });
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, MarketShadowSignalController.prototype.collect)).toBe(HttpStatus.OK);
  });

  it.each([undefined, '', 'not-a-uuid'])('rejects invalid HTTP idempotency key %s before admission', (invalid) => {
    const service = { collect: vi.fn() };
    const controller = new MarketShadowSignalController(service as never);
    expect(() => controller.collect('org-1', { id: 'user-1' } as never, invalid, {})).toThrow('INVALID_IDEMPOTENCY_KEY');
    expect(service.collect).not.toHaveBeenCalled();
  });

  it('rejects client-selected organization, date, or provider limits', () => {
    const service = { collect: vi.fn() };
    const controller = new MarketShadowSignalController(service as never);
    expect(() => controller.collect('org-1', { id: 'user-1' } as never, key, { organizationId: 'other', date: '2026-01-01', limit: 1 })).toThrow('INVALID_SHADOW_REQUEST');
    expect(service.collect).not.toHaveBeenCalled();
  });

  it('scopes status and exact receipt recovery to the authenticated organization', async () => {
    const service = {
      getStatus: vi.fn(async () => ({ status: 'STALE', latestComplete: { id: 'previous' } })),
      readAttempt: vi.fn(async () => ({ attemptId: key, state: 'FAILED' })),
    };
    const controller = new MarketShadowSignalController(service as never);
    expect(await controller.status('org-1')).toMatchObject({ status: 'STALE' });
    expect(await controller.readAttempt('org-1', key)).toEqual({ attemptId: key, state: 'FAILED' });
    expect(service.getStatus).toHaveBeenCalledExactlyOnceWith('org-1');
    expect(service.readAttempt).toHaveBeenCalledExactlyOnceWith('org-1', key);
  });

  it('reads a bounded recent complete history for the authenticated organization', async () => {
    const service = { listRecent: vi.fn(async () => [{ id: 'snapshot-1' }]) };
    const controller = new MarketShadowSignalController(service as never);
    expect(await controller.listRecent({ days: 14 }, 'org-1')).toEqual({ snapshots: [{ id: 'snapshot-1' }] });
    expect(service.listRecent).toHaveBeenCalledExactlyOnceWith('org-1', 14);
  });
});
