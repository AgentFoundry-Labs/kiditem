import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelCatalogCollectionPort } from '../../../../application/port/in/channel-catalog-collection.port';
import { ChannelCatalogCollectionController } from '../channel-catalog-collection.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';
const RUN_ID = '00000000-0000-4000-8000-000000000004';

describe('ChannelCatalogCollectionController', () => {
  it('exposes account-scoped run, status, chunk, error, and finalize routes', () => {
    expect(Reflect.getMetadata('path', ChannelCatalogCollectionController)).toBe(
      'channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs',
    );
    expect(route('start')).toEqual(['/', RequestMethod.POST]);
    expect(route('getStatus')).toEqual([':runId', RequestMethod.GET]);
    expect(route('putChunk')).toEqual([
      ':runId/chunks/:kind/:sequence',
      RequestMethod.PUT,
    ]);
    expect(route('recordError')).toEqual([':runId/errors', RequestMethod.POST]);
    expect(route('finalize')).toEqual([':runId/finalize', RequestMethod.POST]);
  });

  it('uses authenticated organization and user rather than body tenancy', async () => {
    const port = makePort();
    const controller = new ChannelCatalogCollectionController(port);
    const request = {
      clientRunKey: '00000000-0000-4000-8000-000000000005',
      collectorVersion: 'wing-inventory-v1',
    };

    await controller.start(
      ACCOUNT_ID,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      request,
    );

    expect(port.start).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      request,
    });
  });

  it('passes path chunk identity separately from validated payload', async () => {
    const port = makePort();
    const controller = new ChannelCatalogCollectionController(port);
    const payload = {
      version: 1 as const,
      kind: 'manifest_confirmation' as const,
      manifest: {
        totalItems: 1,
        pageSize: 50,
        expectedPages: 1,
        firstPageFingerprint: 'a'.repeat(64),
      },
    };
    const request = {
      kind: 'manifest_confirmation' as const,
      sequence: 1,
      checksum: 'b'.repeat(64),
      itemCount: 1,
      payload,
    };

    await controller.putChunk(
      ACCOUNT_ID,
      RUN_ID,
      'manifest_confirmation',
      1,
      ORGANIZATION_ID,
      { id: USER_ID } as never,
      request,
    );

    expect(port.putChunk).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      runId: RUN_ID,
      kind: 'manifest_confirmation',
      sequence: 1,
      request,
    });
  });
});

function route(method: keyof ChannelCatalogCollectionController) {
  const handler = ChannelCatalogCollectionController.prototype[method];
  return [
    Reflect.getMetadata('path', handler),
    Reflect.getMetadata('method', handler),
  ];
}

function makePort() {
  return {
    start: vi.fn<ChannelCatalogCollectionPort['start']>().mockResolvedValue({} as never),
    getStatus: vi.fn<ChannelCatalogCollectionPort['getStatus']>().mockResolvedValue({} as never),
    putChunk: vi.fn<ChannelCatalogCollectionPort['putChunk']>().mockResolvedValue({} as never),
    recordError: vi.fn<ChannelCatalogCollectionPort['recordError']>().mockResolvedValue({} as never),
    finalize: vi.fn<ChannelCatalogCollectionPort['finalize']>().mockResolvedValue({} as never),
  };
}
