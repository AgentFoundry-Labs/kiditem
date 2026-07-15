import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCommerceService } from '../live-commerce.service';
import type { TaobaoLivePort } from '../../port/out/provider/taobao-live.port';
import type { LiveCommerceRepositoryPort } from '../../port/out/repository/live-commerce.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

function buildService() {
  const taobao: TaobaoLivePort = {
    readiness: vi.fn(() => ({ configured: true, mode: 'official-api', missing: [] })),
    collect: vi.fn(async () => ({ rooms: [], products: [], warnings: [] })),
  };
  const repository: LiveCommerceRepositoryPort = {
    upsertBroadcastSnapshots: vi.fn(async (rows) => rows.length),
    upsertProductSnapshots: vi.fn(async (rows) => rows.length),
    findBroadcastSnapshots: vi.fn(async () => []),
    findProductSnapshots: vi.fn(async () => []),
  };
  return { service: new LiveCommerceService(taobao, repository), taobao, repository };
}

describe('LiveCommerceService', () => {
  let ports: ReturnType<typeof buildService>;

  beforeEach(() => {
    ports = buildService();
  });

  it('persists a validated Douyin room and deduplicated exposed products', async () => {
    const result = await ports.service.ingestExtension(ORGANIZATION_ID, {
      source: 'douyin',
      pageUrl: 'https://live.douyin.com/123456789',
      broadcast: {
        broadcastId: '123456789',
        title: '문구 라이브',
        broadcasterName: '문구상점',
        viewerCount: 1234,
      },
      products: [
        {
          productId: 'item-1',
          title: '스티커',
          priceCny: 2.5,
          sourceUrl: 'https://haohuo.jinritemai.com/views/product/item?id=item-1',
        },
        { productId: 'item-1', title: '중복' },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ source: 'douyin', broadcastCount: 1, productCount: 1 }));
    expect(ports.repository.upsertBroadcastSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        source: 'douyin',
        broadcastId: '123456789',
        broadcasterName: '문구상점',
      }),
    ]);
    expect(ports.repository.upsertProductSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({
        source: 'douyin',
        productId: 'item-1',
        rank: 1,
      }),
    ]);
  });

  it('rejects a source label that does not match the collected page host', async () => {
    await expect(ports.service.ingestExtension(ORGANIZATION_ID, {
      source: 'douyin',
      pageUrl: 'https://zb.1688.com/live/123',
      broadcast: { broadcastId: '123' },
      products: [],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(ports.repository.upsertBroadcastSnapshots).not.toHaveBeenCalled();
  });

  it('rejects an insecure live page URL before persistence', async () => {
    await expect(ports.service.ingestExtension(ORGANIZATION_ID, {
      source: '1688',
      pageUrl: 'http://zb.1688.com/live/123',
      broadcast: { broadcastId: '123' },
      products: [],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(ports.repository.upsertBroadcastSnapshots).not.toHaveBeenCalled();
  });

  it('persists official Taobao rooms and products under the organization scope', async () => {
    ports.taobao.collect = vi.fn(async () => ({
      rooms: [{
        broadcastId: 'tb-live-1',
        title: '타오바오 완구 방송',
        broadcasterId: 'anchor-1',
        broadcasterName: '완구왕',
        status: 'live',
        viewerCount: 5000,
        likeCount: 300,
        startedAt: null,
        endedAt: null,
        coverImageUrl: null,
        sourceUrl: null,
      }],
      products: [{
        broadcastId: 'tb-live-1',
        productId: 'tb-item-1',
        rank: 1,
        title: '블록 완구',
        priceCny: 12,
        salesCount: null,
        imageUrl: null,
        sourceUrl: null,
      }],
      warnings: [],
    }));

    const result = await ports.service.collectTaobao(ORGANIZATION_ID, {
      queryDate: '20260714',
      liveIds: ['tb-live-1'],
    });

    expect(result).toEqual(expect.objectContaining({ broadcastCount: 1, productCount: 1 }));
    expect(ports.repository.upsertBroadcastSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ organizationId: ORGANIZATION_ID, source: 'taobao', broadcastId: 'tb-live-1' }),
    ]);
    expect(ports.repository.upsertProductSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ organizationId: ORGANIZATION_ID, source: 'taobao', productId: 'tb-item-1' }),
    ]);
  });
});
