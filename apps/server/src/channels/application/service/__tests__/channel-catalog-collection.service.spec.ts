import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelCatalogCollectionRepositoryPort } from '../../port/out/repository/channel-catalog-collection.repository.port';
import type { ChannelCatalogPublicationPort } from '../../port/out/repository/channel-catalog-publication.port';
import {
  ChannelCatalogCollectionService,
  hashCatalogChunkPayload,
  hashCoupangCatalogSnapshot,
} from '../channel-catalog-collection.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';
const RUN_ID = '00000000-0000-4000-8000-000000000004';
const CLIENT_RUN_KEY = '00000000-0000-4000-8000-000000000005';

describe('ChannelCatalogCollectionService', () => {
  it('starts or resumes an account-scoped run and derives discovery progress', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher());

    const result = await service.start({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      request: { clientRunKey: CLIENT_RUN_KEY, collectorVersion: 'wing-inventory-v1' },
    });

    expect(repository.startOrResume).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      clientRunKey: CLIENT_RUN_KEY,
      collectorVersion: 'wing-inventory-v1',
    });
    expect(result).toMatchObject({
      id: RUN_ID,
      phase: 'discovery',
      progress: { storedChunks: 0 },
    });
  });

  it('reports missing pages and products entirely from durable chunks', async () => {
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue(runWithChunks([
      discoveryChunk(1, [
        { ordinal: 0, externalProductId: 'P-1', registeredName: '첫 상품', primaryImageUrl: null },
        { ordinal: 1, externalProductId: 'P-2', registeredName: '둘째 상품', primaryImageUrl: null },
      ]),
      productChunk(0, ['P-1']),
    ]));
    const service = new ChannelCatalogCollectionService(repository, makePublisher());

    const result = await service.getStatus(ownedInput());

    expect(result.phase).toBe('discovery');
    expect(result.progress).toMatchObject({
      discoveryPagesStored: 1,
      discoveredProducts: 2,
      hydratedProducts: 1,
      optionCount: 1,
      mediaCount: 1,
      storedChunks: 2,
    });
    expect(result.missing).toEqual({
      discoverySequences: [2],
      productIds: ['P-2'],
    });
  });

  it('recomputes a canonical payload checksum before accepting a chunk', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher());
    const payload = discoveryPayload(1, [
      { ordinal: 0, externalProductId: 'P-1', registeredName: '상품', primaryImageUrl: null },
    ]);

    await service.putChunk({
      ...ownedInput(),
      kind: 'discovery_page',
      sequence: 1,
      request: {
        kind: 'discovery_page',
        sequence: 1,
        checksum: hashCatalogChunkPayload(payload),
        itemCount: 1,
        payload,
      },
    });

    expect(repository.putChunk).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      checksum: hashCatalogChunkPayload(payload),
      payload,
    }));
  });

  it('rejects a checksum mismatch before writing JSONB', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher());
    const payload = discoveryPayload(1, [
      { ordinal: 0, externalProductId: 'P-1', registeredName: '상품', primaryImageUrl: null },
    ]);

    await expect(service.putChunk({
      ...ownedInput(),
      kind: 'discovery_page',
      sequence: 1,
      request: {
        kind: 'discovery_page',
        sequence: 1,
        checksum: 'f'.repeat(64),
        itemCount: 1,
        payload,
      },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.putChunk).not.toHaveBeenCalled();
  });

  it('blocks finalize until discovery, hydration, and manifest confirmation are complete', async () => {
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue(runWithChunks([
      discoveryChunk(1, [
        { ordinal: 0, externalProductId: 'P-1', registeredName: '상품', primaryImageUrl: null },
      ]),
    ]));
    const publisher = makePublisher();
    const service = new ChannelCatalogCollectionService(repository, publisher);

    await expect(service.finalize({
      ...ownedInput(),
      userId: USER_ID,
      request: { snapshotHash: 'a'.repeat(64) },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('exposes the server canonical hash when a resumable snapshot is ready', async () => {
    const repository = makeRepository();
    const chunks = [
      discoveryChunk(1, [
        { ordinal: 0, externalProductId: 'P-1', registeredName: '상품', primaryImageUrl: null },
      ], onePageManifest()),
      productChunk(0, ['P-1']),
      confirmationChunk(onePageManifest()),
    ];
    repository.getOwnedRunWithChunks.mockResolvedValue(runWithChunks(chunks));
    const service = new ChannelCatalogCollectionService(repository, makePublisher());

    const result = await service.getStatus(ownedInput());

    expect(result.phase).toBe('ready_to_finalize');
    expect(result.snapshotHash).toBe(hashCoupangCatalogSnapshot([
      productChunk(0, ['P-1']).payload.products[0],
    ]));
  });

  it('publishes one complete canonical snapshot with the server-computed hash', async () => {
    const repository = makeRepository();
    const chunks = [
      discoveryChunk(1, [
        { ordinal: 0, externalProductId: 'P-1', registeredName: '상품', primaryImageUrl: null },
      ], onePageManifest()),
      productChunk(0, ['P-1']),
      confirmationChunk(onePageManifest()),
    ];
    repository.getOwnedRunWithChunks.mockResolvedValue(runWithChunks(chunks));
    const publisher = makePublisher();
    const service = new ChannelCatalogCollectionService(repository, publisher);
    const snapshotHash = hashCoupangCatalogSnapshot([
      productChunk(0, ['P-1']).payload.products[0],
    ]);

    await service.finalize({
      ...ownedInput(),
      userId: USER_ID,
      request: { snapshotHash },
    });

    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      collectionRunId: RUN_ID,
      snapshotHash,
      products: [productChunk(0, ['P-1']).payload.products[0]],
    }));
  });
});

function ownedInput() {
  return {
    organizationId: ORGANIZATION_ID,
    channelAccountId: ACCOUNT_ID,
    runId: RUN_ID,
  };
}

function makeRepository() {
  return {
    startOrResume: vi.fn<ChannelCatalogCollectionRepositoryPort['startOrResume']>()
      .mockResolvedValue(runRecord()),
    getOwnedRunWithChunks: vi.fn<ChannelCatalogCollectionRepositoryPort['getOwnedRunWithChunks']>()
      .mockResolvedValue(runWithChunks([])),
    putChunk: vi.fn<ChannelCatalogCollectionRepositoryPort['putChunk']>()
      .mockResolvedValue({ stored: true, chunk: {} as never }),
    recordRecoverableError: vi.fn<ChannelCatalogCollectionRepositoryPort['recordRecoverableError']>(),
    markFailed: vi.fn<ChannelCatalogCollectionRepositoryPort['markFailed']>(),
  };
}

function makePublisher() {
  return {
    publish: vi.fn<ChannelCatalogPublicationPort['publish']>().mockResolvedValue({
      sourceImportRunId: '00000000-0000-4000-8000-000000000006',
      duplicate: false,
      changes: { createdProductCount: 1 },
    }),
  };
}

function runRecord() {
  const timestamp = new Date('2026-07-14T00:00:00.000Z');
  return {
    id: RUN_ID,
    organizationId: ORGANIZATION_ID,
    channelAccountId: ACCOUNT_ID,
    clientRunKey: CLIENT_RUN_KEY,
    status: 'running',
    rowCount: 0,
    errorCount: 0,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    finishedAt: null,
    metaJson: { phase: 'discovery', collectorVersion: 'wing-inventory-v1' },
    errorJson: null,
    sourceImportRunId: null,
  };
}

function runWithChunks(chunks: Array<ReturnType<typeof discoveryChunk> | ReturnType<typeof productChunk> | ReturnType<typeof confirmationChunk>>) {
  return { ...runRecord(), chunks };
}

function onePageManifest() {
  return {
    totalItems: 1,
    pageSize: 50,
    expectedPages: 1,
    firstPageFingerprint: 'a'.repeat(64),
  };
}

function twoPageManifest() {
  return {
    totalItems: 2,
    pageSize: 1,
    expectedPages: 2,
    firstPageFingerprint: 'a'.repeat(64),
  };
}

function discoveryPayload(
  page: number,
  items: Array<{
    ordinal: number;
    externalProductId: string;
    registeredName: string | null;
    primaryImageUrl: string | null;
  }>,
  manifest = twoPageManifest(),
) {
  return { version: 1 as const, kind: 'discovery_page' as const, page, manifest, items };
}

function discoveryChunk(
  page: number,
  items: Parameters<typeof discoveryPayload>[1],
  manifest = twoPageManifest(),
) {
  return {
    id: `discovery-${page}`,
    kind: 'discovery_page',
    sequence: page,
    checksum: 'a'.repeat(64),
    itemCount: items.length,
    payload: discoveryPayload(page, items, manifest),
  };
}

function productChunk(startOrdinal: number, productIds: string[]) {
  const products = productIds.map((externalProductId, index) => ({
    ordinal: startOrdinal + index,
    product: {
      externalProductId,
      registeredName: `${externalProductId} 등록상품`,
      displayName: `${externalProductId} 노출상품`,
      category: '완구',
      manufacturer: null,
      brand: null,
      productStatus: '승인완료',
      options: [{
        externalOptionId: `${externalProductId}-SKU`,
        optionName: '기본',
        skuStatus: '판매중',
        salePrice: 12_900,
        sellerSku: `${externalProductId}-SELLER`,
        modelNumber: null,
        barcode: null,
        attributes: [],
        media: [],
        raw: { source: 'fixture-option' },
      }],
      media: [{
        sourceUrl: 'https://example.com/image.jpg',
        role: 'primary' as const,
        sortOrder: 0,
        externalOptionId: null,
      }],
      raw: { source: 'fixture' },
    },
  }));
  return {
    id: `products-${startOrdinal}`,
    kind: 'product_details',
    sequence: startOrdinal + 1,
    checksum: 'b'.repeat(64),
    itemCount: products.length,
    payload: {
      version: 1 as const,
      kind: 'product_details' as const,
      startOrdinal,
      products,
    },
  };
}

function confirmationChunk(manifest = onePageManifest()) {
  return {
    id: 'confirmation',
    kind: 'manifest_confirmation',
    sequence: 1,
    checksum: 'c'.repeat(64),
    itemCount: 1,
    payload: {
      version: 1 as const,
      kind: 'manifest_confirmation' as const,
      manifest,
    },
  };
}
