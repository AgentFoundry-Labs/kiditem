import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../../../auth/auth.types';
import type { ChannelSkuMappingService } from '../../../application/service/channel-sku-mapping.service';
import {
  ChannelSkuCandidateQueryDto,
  ChannelSkuMappingQueryDto,
} from '../dto/channel-sku-mapping-query.dto';
import { ChannelSkuMappingController } from '../channel-sku-mapping.controller';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const channelSkuId = '00000000-0000-4000-8000-000000000003';

describe('ChannelSkuMappingController', () => {
  it('exposes exactly the four fixed routes under channels/sku-mappings', () => {
    expect(Reflect.getMetadata('path', ChannelSkuMappingController)).toBe(
      'channels/sku-mappings',
    );
    const methods = Object.getOwnPropertyNames(ChannelSkuMappingController.prototype)
      .filter((name) => name !== 'constructor');
    expect(methods).toEqual(['list', 'refreshStatuses', 'candidates', 'replaceComponents']);
    expect(route('list')).toEqual(['/', RequestMethod.GET]);
    expect(route('refreshStatuses')).toEqual(['status-refresh', RequestMethod.POST]);
    expect(route('candidates')).toEqual([':channelSkuId/candidates', RequestMethod.GET]);
    expect(route('replaceComponents')).toEqual([':channelSkuId/components', RequestMethod.PUT]);
  });

  it('transforms and validates account/status/search/page/limit list queries', async () => {
    const dto = plainToInstance(ChannelSkuMappingQueryDto, {
      channelAccountId: '00000000-0000-4000-8000-000000000010',
      mappingStatus: 'needs_review',
      search: 'bear',
      page: '2',
      limit: '200',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 2, limit: 200 });

    const invalid = plainToInstance(ChannelSkuMappingQueryDto, {
      mappingStatus: 'conflict',
      limit: 201,
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('caps candidate search limit at 100 and wires UUID validation on its path param', async () => {
    const valid = plainToInstance(ChannelSkuCandidateQueryDto, { search: 'SP', limit: '100' });
    const invalid = plainToInstance(ChannelSkuCandidateQueryDto, { limit: '101' });
    expect(await validate(valid)).toEqual([]);
    expect(valid.limit).toBe(100);
    expect(await validate(invalid)).not.toHaveLength(0);

    const source = readFileSync(
      __filename.replace(/__tests__\/[^/]+$/, 'channel-sku-mapping.controller.ts'),
      'utf8',
    );
    expect(source.match(/@Param\('channelSkuId', new ParseUUIDPipe\(\)\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/organizationId.*@Body|organizationId.*@Query/);
  });

  it('passes the current organization to every service call and current user only to replacement', async () => {
    const service = makeService();
    const controller = new ChannelSkuMappingController(service);
    const user = { id: userId } as AuthUser;

    await controller.list(organizationId, { page: 1, limit: 50 });
    await controller.refreshStatuses(organizationId, {});
    await controller.candidates(channelSkuId, organizationId, { limit: 25 });
    await controller.replaceComponents(
      channelSkuId,
      organizationId,
      user,
      { components: [{ inventorySkuId: channelSkuId, quantity: 2 }] },
    );

    expect(service.list).toHaveBeenCalledWith(organizationId, { page: 1, limit: 50 });
    expect(service.refreshStatuses).toHaveBeenCalledWith(organizationId, {});
    expect(service.candidates).toHaveBeenCalledWith(
      organizationId,
      channelSkuId,
      { limit: 25 },
    );
    expect(service.replaceComponents).toHaveBeenCalledWith(
      organizationId,
      userId,
      channelSkuId,
      { components: [{ inventorySkuId: channelSkuId, quantity: 2 }] },
    );
  });

  it('strictly rejects unknown replacement and status-refresh privilege fields', async () => {
    const controller = new ChannelSkuMappingController(makeService());
    const user = { id: userId } as AuthUser;

    await expect(controller.refreshStatuses(organizationId, {
      organizationId,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.replaceComponents(channelSkuId, organizationId, user, {
      components: [],
      role: 'owner',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});

function route(
  method: 'list' | 'refreshStatuses' | 'candidates' | 'replaceComponents',
) {
  const target = ChannelSkuMappingController.prototype[method];
  return [Reflect.getMetadata('path', target), Reflect.getMetadata('method', target)];
}

function makeService() {
  return {
    list: vi.fn().mockResolvedValue({}),
    refreshStatuses: vi.fn().mockResolvedValue({}),
    candidates: vi.fn().mockResolvedValue({}),
    replaceComponents: vi.fn().mockResolvedValue({}),
  } as unknown as ChannelSkuMappingService & {
    list: ReturnType<typeof vi.fn>;
    refreshStatuses: ReturnType<typeof vi.fn>;
    candidates: ReturnType<typeof vi.fn>;
    replaceComponents: ReturnType<typeof vi.fn>;
  };
}
