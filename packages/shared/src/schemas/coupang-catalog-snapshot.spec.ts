import { describe, expect, it } from 'vitest';
import {
  CoupangCatalogAttributeV1Schema,
  CoupangCatalogCollectionPlanSchema,
  CoupangCatalogCollectionRunSchema,
  CoupangCatalogCollectionPermitSchema,
  CoupangCatalogDeletionConfirmationChunkV1Schema,
  CoupangCatalogDetailProductV1Schema,
  CoupangCatalogDiscoveryPageV1Schema,
  CoupangCatalogManifestConfirmationV1Schema,
  CoupangCatalogBasicProductV1Schema,
  CoupangCatalogListingBasicsChunkV1Schema,
  PutCoupangCatalogChunkRequestSchema,
  StartCoupangCatalogCollectionRequestSchema,
} from './coupang-catalog-snapshot';

const accountId = '00000000-0000-4000-8000-000000000001';
const runId = '00000000-0000-4000-8000-000000000002';
const clientRunKey = '00000000-0000-4000-8000-000000000003';
const checksum = 'a'.repeat(64);

const media = {
  sourceUrl: 'https://thumbnail.coupangcdn.com/example.jpg',
  role: 'primary' as const,
  sortOrder: 0,
  externalOptionId: null,
};

const product = {
  externalProductId: '10001',
  registeredName: '테스트 등록 상품',
  displayName: '테스트 노출 상품',
  category: '완구',
  manufacturer: '제조사',
  brand: '브랜드',
  productStatus: '승인완료',
  options: [
    {
      externalOptionId: '20001',
      optionName: '빨강',
      skuStatus: '판매중',
      salePrice: 12_900,
      sellerSku: 'SELLER-RED',
      modelNumber: null,
      barcode: null,
      attributes: [{ type: '색상', value: '빨강' }],
      media: [],
      raw: { vendorItemId: '20001' },
    },
  ],
  media: [media],
  raw: { source: 'fixture' },
};

const manifest = {
  totalItems: 2,
  pageSize: 1,
  expectedPages: 2,
  firstPageFingerprint: checksum,
};

describe('Coupang catalog snapshot contracts', () => {
  it('accepts single-option and multi-option products', () => {
    expect(CoupangCatalogBasicProductV1Schema.parse(product).options).toHaveLength(1);
    const parsed = CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      options: [
        product.options[0],
        {
          ...product.options[0],
          externalOptionId: '20002',
          optionName: '파랑',
          attributes: [{ type: '색상', value: '파랑' }],
          media: [{ ...media, role: 'option', externalOptionId: '20002' }],
        },
      ],
    });
    expect(parsed.options).toHaveLength(2);
  });

  it('rejects blank identities and duplicate option IDs', () => {
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      externalProductId: ' ',
    })).toThrow();
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      options: [product.options[0], product.options[0]],
    })).toThrow(/duplicate externalOptionId/i);
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      options: [{ ...product.options[0], salePrice: -1 }],
    })).toThrow();
  });

  it('rejects media assigned to an option outside its owner', () => {
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      options: [{
        ...product.options[0],
        media: [{ ...media, role: 'option', externalOptionId: '99999' }],
      }],
    })).toThrow(/media externalOptionId/i);
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      media: [{ ...media, role: 'option', externalOptionId: '99999' }],
    })).toThrow(/unknown option/i);
  });

  it('accepts only HTTP(S) provider URLs and bounded cardinality', () => {
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      media: [{ ...media, sourceUrl: 'javascript:alert(1)' }],
    })).toThrow();
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      media: Array.from({ length: 101 }, (_, sortOrder) => ({ ...media, sortOrder })),
    })).toThrow();
    expect(() => CoupangCatalogBasicProductV1Schema.parse({
      ...product,
      options: Array.from({ length: 501 }, (_, index) => ({
        ...product.options[0],
        externalOptionId: String(30_000 + index),
      })),
    })).toThrow();
  });

  it('accepts shared detail media when each option stays within its owner limit', () => {
    const optionIds = Array.from({ length: 73 }, (_, index) => 'option-' + (index + 1));
    const detailMedia = [
      {
        sourceUrl: 'https://image.example/shared-detail.jpg',
        role: 'detail' as const,
        sortOrder: 0,
        externalOptionIds: optionIds,
      },
      ...optionIds.map((externalOptionId, index) => ({
        sourceUrl: 'https://image.example/detail-' + (index + 1) + '.jpg',
        role: 'detail' as const,
        sortOrder: index + 1,
        externalOptionIds: [externalOptionId],
      })),
      ...optionIds.map((externalOptionId, index) => ({
        sourceUrl: 'https://image.example/option-' + (index + 1) + '.jpg',
        role: 'option' as const,
        sortOrder: 74 + index,
        externalOptionIds: [externalOptionId],
      })),
    ];
    const parsed = CoupangCatalogDetailProductV1Schema.parse({
      externalProductId: 'detail-1',
      options: optionIds.map((externalOptionId) => ({
        externalOptionId,
        documentIds: [],
        raw: {},
      })),
      documents: [],
      media: detailMedia,
      raw: { source: 'fixture' },
    });

    expect(parsed.media).toHaveLength(147);
    expect(parsed.media[0]?.externalOptionIds).toEqual(optionIds);
    const ownerCounts = new Map<string, number>();
    for (const media of parsed.media) {
      for (const ownerId of new Set(media.externalOptionIds ?? [])) {
        ownerCounts.set(ownerId, (ownerCounts.get(ownerId) ?? 0) + 1);
      }
    }
    expect([...ownerCounts.values()].every((count) => count === 3)).toBe(true);
  });

  it('enforces per-option and unassociated media limits without weakening legacy or byte guards', () => {
    const base = {
      externalProductId: 'detail-1',
      options: [{ externalOptionId: 'option-1', documentIds: [], raw: {} }],
      documents: [],
      media: [],
      raw: { source: 'fixture' },
    };
    const mediaFor = (count: number, externalOptionIds: string[]) =>
      Array.from({ length: count }, (_, index) => ({
        sourceUrl: 'https://image.example/media-' + (index + 1) + '.jpg',
        role: 'detail' as const,
        sortOrder: index,
        externalOptionIds,
      }));

    expect(CoupangCatalogDetailProductV1Schema.parse({
      ...base,
      media: mediaFor(100, []),
    }).media).toHaveLength(100);
    expect(CoupangCatalogDetailProductV1Schema.parse({
      ...base,
      media: mediaFor(100, ['option-1', 'option-1']),
    }).media).toHaveLength(100);
    expect(CoupangCatalogDetailProductV1Schema.parse({
      ...base,
      media: Array.from({ length: 100 }, (_, index) => ({
        sourceUrl: 'https://image.example/legacy-' + (index + 1) + '.jpg',
        role: 'detail' as const,
        sortOrder: index,
        externalOptionId: 'option-1',
      })),
    }).media).toHaveLength(100);
    expect(() => CoupangCatalogDetailProductV1Schema.parse({
      ...base,
      media: mediaFor(101, ['option-1']),
    })).toThrow(/media exceeds.*option-1/);
    expect(() => CoupangCatalogDetailProductV1Schema.parse({
      ...base,
      media: mediaFor(101, []),
    })).toThrow(/unassociated media exceeds/);
    expect(() => CoupangCatalogDetailProductV1Schema.parse({
      ...base,
      media: mediaFor(1, ['unknown-option']),
    })).toThrow(/unknown option/);

    const oversizedDocuments = Array.from({ length: 2_000 }, (_, index) => ({
      id: 'doc-' + index,
      kind: 'contents' as const,
      value: String(index) + '-' + 'x'.repeat(240),
    }));
    expect(() => CoupangCatalogDetailProductV1Schema.parse({
      ...base,
      options: [{
        ...base.options[0],
        documentIds: oversizedDocuments.map((document) => document.id),
      }],
      documents: oversizedDocuments,
    })).toThrow(/detail product exceeds/);
  });

  it('validates discovery identity, ordinals, and manifest page math', () => {
    const page = CoupangCatalogDiscoveryPageV1Schema.parse({
      version: 1,
      kind: 'discovery_page',
      page: 1,
      manifest,
      items: [{
        ordinal: 0,
        externalProductId: '10001',
        registeredName: '첫 상품',
        primaryImageUrl: media.sourceUrl,
        saleStatus: '판매중',
      }],
    });
    expect(page.items[0]?.saleStatus).toBe('판매중');
    expect(page.manifest.expectedPages).toBe(2);
    expect(() => CoupangCatalogDiscoveryPageV1Schema.parse({
      ...page,
      manifest: { ...manifest, expectedPages: 9 },
    })).toThrow(/expectedPages/i);
    expect(() => CoupangCatalogDiscoveryPageV1Schema.parse({
      ...page,
      items: [page.items[0], page.items[0]],
    })).toThrow(/duplicate externalProductId/i);
  });

  it('requires deterministic contiguous listing-basics ordinals', () => {
    const chunk = CoupangCatalogListingBasicsChunkV1Schema.parse({
      version: 1,
      kind: 'listing_basics',
      startOrdinal: 0,
      products: [
        { ordinal: 0, product },
        { ordinal: 1, product: { ...product, externalProductId: '10002' } },
      ],
    });
    expect(chunk.products).toHaveLength(2);
    expect(() => CoupangCatalogListingBasicsChunkV1Schema.parse({
      ...chunk,
      products: [chunk.products[0], { ...chunk.products[1], ordinal: 2 }],
    })).toThrow(/contiguous/i);
  });

  it('removes the legacy full stage and its product_details chunk (KID-348)', () => {
    expect(() => StartCoupangCatalogCollectionRequestSchema.parse({
      collectorVersion: 'wing-inventory-v1',
      stage: 'full',
    })).toThrow();
    expect(() => StartCoupangCatalogCollectionRequestSchema.parse({
      collectorVersion: 'wing-inventory-v1',
    })).toThrow();
    expect(() => PutCoupangCatalogChunkRequestSchema.parse({
      kind: 'product_details',
      sequence: 1,
      checksum,
      itemCount: 1,
      payload: { version: 1, kind: 'product_details', startOrdinal: 0, products: [{ ordinal: 0, product }] },
    })).toThrow();
  });

  it('validates all chunk kinds, checksums, and route sequences', () => {
    const discovery = {
      version: 1,
      kind: 'discovery_page' as const,
      page: 1,
      manifest,
      items: [{
        ordinal: 0,
        externalProductId: '10001',
        registeredName: null,
        primaryImageUrl: null,
      }],
    };
    expect(PutCoupangCatalogChunkRequestSchema.parse({
      kind: 'discovery_page',
      sequence: 1,
      checksum,
      itemCount: 1,
      payload: discovery,
    }).kind).toBe('discovery_page');
    expect(() => PutCoupangCatalogChunkRequestSchema.parse({
      kind: 'discovery_page',
      sequence: 2,
      checksum,
      itemCount: 1,
      payload: discovery,
    })).toThrow(/sequence/i);
    expect(() => PutCoupangCatalogChunkRequestSchema.parse({
      kind: 'discovery_page',
      sequence: 1,
      checksum: 'short',
      itemCount: 1,
      payload: discovery,
    })).toThrow();

    expect(CoupangCatalogManifestConfirmationV1Schema.parse({
      version: 1,
      kind: 'manifest_confirmation',
      manifest,
    }).manifest.firstPageFingerprint).toBe(checksum);
  });

  it('validates start and resumable status responses', () => {
    expect(StartCoupangCatalogCollectionRequestSchema.parse({
      collectorVersion: 'wing-inventory-v1',
      stage: 'basics',
    }).collectorVersion).toBe('wing-inventory-v1');
    expect(() => StartCoupangCatalogCollectionRequestSchema.parse({
      clientRunKey: 'not-a-uuid',
      collectorVersion: '',
    })).toThrow();

    const parsed = CoupangCatalogCollectionRunSchema.parse({
      attemptId: runId,
      channelAccountId: accountId,
      idempotencyKey: clientRunKey,
      state: 'RUNNING',
      expiresAt: '2026-07-15T00:00:00.000Z',
      plan: { stage: 'basics', channelAccountId: accountId, vendorId: 'V1', collectorVersion: 'wing-inventory-v1', listUrl: 'https://wing.coupang.com/list', detailUrl: 'https://wing.coupang.com/detail', publicationRevision: '0' },
      phase: 'hydration',
      collectorVersion: 'wing-inventory-v1',
      manifest,
      progress: {
        discoveryPagesStored: 2,
        discoveredProducts: 2,
        hydratedProducts: 1,
        optionCount: 1,
        mediaCount: 1,
        storedChunks: 3,
        publishedProducts: 1,
        publishedOptionCount: 1,
        publishedMediaCount: 1,
        publishedChunks: 1,
        firstPublishedAt: '2026-07-14T00:00:30.000Z',
        lastPublishedAt: '2026-07-14T00:00:30.000Z',
      },
      missing: {
        discoverySequences: [],
        productIds: ['10002'],
      },
      snapshotHash: null,
      error: null,
      publication: null,
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:01:00.000Z',
      finishedAt: null,
    });
    expect(parsed.missing.productIds).toEqual(['10002']);
    expect(CoupangCatalogCollectionPermitSchema.parse({ attemptId: runId, attemptToken: clientRunKey, state: parsed.state, expiresAt: parsed.expiresAt, plan: parsed.plan }).attemptToken).toBe(clientRunKey);
    expect(CoupangCatalogCollectionRunSchema.parse({ ...parsed, attemptToken: clientRunKey })).not.toHaveProperty('attemptToken');
    expect(parsed.progress.publishedProducts).toBe(1);
    expect(parsed.progress.lastPublishedAt).toBe('2026-07-14T00:00:30.000Z');
    expect(() => CoupangCatalogCollectionRunSchema.parse({
      ...parsed,
      progress: { ...parsed.progress, publishedProducts: -1 },
    })).toThrow();
  });
});

describe('KID-348·349 additive contracts', () => {
  it('accepts a deletion confirmation chunk and rejects a duplicated product', () => {
    const chunk = {
      version: 1,
      kind: 'deletion_confirmation',
      products: [
        { externalProductId: '1', outcome: 'deleted', productStatus: 'DELETED' },
        { externalProductId: '2', outcome: 'not_found' },
      ],
    };
    const parsed = CoupangCatalogDeletionConfirmationChunkV1Schema.parse(chunk);
    expect(parsed.products[1]?.productStatus).toBeNull();
    expect(PutCoupangCatalogChunkRequestSchema.safeParse({
      sequence: 3, checksum, itemCount: 2, kind: 'deletion_confirmation', payload: chunk,
    }).success).toBe(true);
    expect(PutCoupangCatalogChunkRequestSchema.safeParse({
      sequence: 3, checksum, itemCount: 1, kind: 'deletion_confirmation', payload: chunk,
    }).success).toBe(false);
    expect(CoupangCatalogDeletionConfirmationChunkV1Schema.safeParse({
      ...chunk,
      products: [chunk.products[0], chunk.products[0]],
    }).success).toBe(false);
  });

  it('keeps the legacy attribute shape and takes the new optional fields', () => {
    expect(CoupangCatalogAttributeV1Schema.parse({ type: '색상', value: '빨강' })).toEqual({ type: '색상', value: '빨강' });
    expect(CoupangCatalogAttributeV1Schema.parse({
      type: '색상', value: '빨강', kind: 'search', attributeTypeId: '7', exposed: false,
    }).kind).toBe('search');
    expect(CoupangCatalogAttributeV1Schema.safeParse({ type: '색상', value: '빨강', kind: 'other' }).success).toBe(false);
  });

  it('carries detail targets and absent products in the plan and a requested product list in the start request', () => {
    const plan = CoupangCatalogCollectionPlanSchema.parse({
      collectorVersion: 'wing-inventory-v1',
      stage: 'details',
      listUrl: 'https://wing.coupang.com/list',
      detailUrl: 'https://wing.coupang.com/detail',
      channelAccountId: accountId,
      vendorId: 'A0001',
      publicationRevision: '1',
      detailTargetProductIds: ['1', '2'],
      absentProductIds: ['9'],
    });
    expect(plan.detailTargetProductIds).toEqual(['1', '2']);
    expect(StartCoupangCatalogCollectionRequestSchema.parse({
      collectorVersion: 'wing-inventory-v1', stage: 'details', detailProductIds: ['1'],
    }).detailProductIds).toEqual(['1']);
    expect(StartCoupangCatalogCollectionRequestSchema.safeParse({
      collectorVersion: 'wing-inventory-v1', detailProductIds: [],
    }).success).toBe(false);
  });
});
