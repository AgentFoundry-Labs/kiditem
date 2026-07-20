import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelSkuAvailabilityPort } from '../../../application/port/in/channel-sku-availability.port';
import { ChannelSkuAvailabilityController } from './channel-sku-availability.controller';
import { ChannelSkuAvailabilityQueryDto } from './dto/channel-sku-availability-query.dto';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('ChannelSkuAvailabilityController', () => {
  it('publishes the read-only availability list route', () => {
    expect(Reflect.getMetadata('path', ChannelSkuAvailabilityController)).toBe(
      'channels/sku-availability',
    );
    const method = ChannelSkuAvailabilityController.prototype.list;
    expect(Reflect.getMetadata('path', method)).toBe('/');
    expect(Reflect.getMetadata('method', method)).toBe(RequestMethod.GET);
  });

  it('transforms and validates account/status/search/page/limit queries', async () => {
    const valid = plainToInstance(ChannelSkuAvailabilityQueryDto, {
      channelAccountId: '00000000-0000-4000-8000-000000000002',
      status: 'out_of_stock',
      hasBottleneck: 'true',
      search: 'bear',
      page: '2',
      limit: '100',
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid).toMatchObject({
      status: 'out_of_stock',
      hasBottleneck: true,
      page: 2,
      limit: 100,
    });

    const invalidStatus = plainToInstance(ChannelSkuAvailabilityQueryDto, {
      status: 'matched',
    });
    const invalidLimit = plainToInstance(ChannelSkuAvailabilityQueryDto, {
      limit: '101',
    });
    const invalidBottleneck = plainToInstance(ChannelSkuAvailabilityQueryDto, {
      hasBottleneck: 'yes',
    });
    expect(await validate(invalidStatus)).not.toHaveLength(0);
    expect(await validate(invalidLimit)).not.toHaveLength(0);
    expect(await validate(invalidBottleneck)).not.toHaveLength(0);
  });

  it('passes authenticated organization scope to the owner port', async () => {
    const availability = {
      list: vi.fn().mockResolvedValue({}),
      findByChannelSkuIds: vi.fn().mockResolvedValue([]),
      findByListingIds: vi.fn().mockResolvedValue([]),
    } as unknown as ChannelSkuAvailabilityPort;
    const controller = new ChannelSkuAvailabilityController(availability);
    const query = new ChannelSkuAvailabilityQueryDto();

    await controller.list(organizationId, query);

    expect(availability.list).toHaveBeenCalledWith(organizationId, query);
  });
});
