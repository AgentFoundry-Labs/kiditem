import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelCatalogSourceController } from '../channel-catalog-source.controller';
import type { ChannelCatalogCollectionPort } from '../../../../application/port/in/channel-catalog-collection.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';

describe('ChannelCatalogSourceController', () => {
  it('reads the account latest Wing catalog import for the authenticated organization', async () => {
    expect(Reflect.getMetadata('path', ChannelCatalogSourceController)).toBe(
      'channels/accounts/:channelAccountId/catalog-imports/coupang-wing',
    );
    const handler = ChannelCatalogSourceController.prototype.readSource;
    expect([Reflect.getMetadata('path', handler), Reflect.getMetadata('method', handler)]).toEqual([
      'source',
      RequestMethod.GET,
    ]);
    const source = { latestAttempt: null, detailsAttempt: null };
    const port = {
      readSource: vi.fn<ChannelCatalogCollectionPort['readSource']>().mockResolvedValue(source),
    };
    const controller = new ChannelCatalogSourceController(port as unknown as ChannelCatalogCollectionPort);

    await expect(controller.readSource(ACCOUNT_ID, ORGANIZATION_ID)).resolves.toEqual(source);
    expect(port.readSource).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
    });
  });
});
