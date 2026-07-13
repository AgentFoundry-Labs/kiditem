import { describe, expect, it } from 'vitest';
import {
  CoupangCatalogCollectionRunSchema,
  CoupangCatalogDiscoveryPageV1Schema,
  CoupangCatalogManifestConfirmationV1Schema,
  CoupangCatalogProductDetailsChunkV1Schema,
  CoupangCatalogProductV1Schema,
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
    expect(CoupangCatalogProductV1Schema.parse(product).options).toHaveLength(1);
    const parsed = CoupangCatalogProductV1Schema.parse({
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
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      externalProductId: ' ',
    })).toThrow();
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      options: [product.options[0], product.options[0]],
    })).toThrow(/duplicate externalOptionId/i);
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      options: [{ ...product.options[0], salePrice: -1 }],
    })).toThrow();
  });

  it('rejects media assigned to an option outside its owner', () => {
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      options: [{
        ...product.options[0],
        media: [{ ...media, role: 'option', externalOptionId: '99999' }],
      }],
    })).toThrow(/media externalOptionId/i);
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      media: [{ ...media, role: 'option', externalOptionId: '99999' }],
    })).toThrow(/unknown option/i);
  });

  it('accepts only HTTP(S) provider URLs and bounded cardinality', () => {
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      media: [{ ...media, sourceUrl: 'javascript:alert(1)' }],
    })).toThrow();
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      media: Array.from({ length: 101 }, (_, sortOrder) => ({ ...media, sortOrder })),
    })).toThrow();
    expect(() => CoupangCatalogProductV1Schema.parse({
      ...product,
      options: Array.from({ length: 501 }, (_, index) => ({
        ...product.options[0],
        externalOptionId: String(30_000 + index),
      })),
    })).toThrow();
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
      }],
    });
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

  it('requires deterministic contiguous product-detail ordinals', () => {
    const chunk = CoupangCatalogProductDetailsChunkV1Schema.parse({
      version: 1,
      kind: 'product_details',
      startOrdinal: 0,
      products: [
        { ordinal: 0, product },
        { ordinal: 1, product: { ...product, externalProductId: '10002' } },
      ],
    });
    expect(chunk.products).toHaveLength(2);
    expect(() => CoupangCatalogProductDetailsChunkV1Schema.parse({
      ...chunk,
      products: [chunk.products[0], { ...chunk.products[1], ordinal: 2 }],
    })).toThrow(/contiguous/i);
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
      clientRunKey,
      collectorVersion: 'wing-inventory-v1',
    }).clientRunKey).toBe(clientRunKey);
    expect(() => StartCoupangCatalogCollectionRequestSchema.parse({
      clientRunKey: 'not-a-uuid',
      collectorVersion: '',
    })).toThrow();

    const parsed = CoupangCatalogCollectionRunSchema.parse({
      id: runId,
      channelAccountId: accountId,
      clientRunKey,
      status: 'running',
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
  });
});
