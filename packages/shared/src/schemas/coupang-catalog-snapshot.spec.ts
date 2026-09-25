import { describe, expect, it } from 'vitest';
import {
  CoupangCatalogAttributeV1Schema,
  CoupangCatalogDetailProductV1Schema,
  CoupangCatalogBasicProductV1Schema,
  WingCatalogDeletionConfirmationItemSchema,
  WingCatalogDetailsScopeSchema,
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
});

describe('KID-348·349 additive contracts', () => {
  it('accepts a deletion confirmation element with a null status default (KID-354)', () => {
    expect(WingCatalogDeletionConfirmationItemSchema.parse({ externalProductId: '2', outcome: 'not_found' }))
      .toEqual({ externalProductId: '2', outcome: 'not_found', productStatus: null });
    expect(WingCatalogDeletionConfirmationItemSchema.safeParse({ externalProductId: '2', outcome: 'gone' }).success).toBe(false);
  });

  it('keeps the legacy attribute shape and takes the new optional fields', () => {
    expect(CoupangCatalogAttributeV1Schema.parse({ type: '색상', value: '빨강' })).toEqual({ type: '색상', value: '빨강' });
    expect(CoupangCatalogAttributeV1Schema.parse({
      type: '색상', value: '빨강', kind: 'search', attributeTypeId: '7', exposed: false,
    }).kind).toBe('search');
    expect(CoupangCatalogAttributeV1Schema.safeParse({ type: '색상', value: '빨강', kind: 'other' }).success).toBe(false);
  });

  it('reads a details scope started directly as manual and one chained from the list as list (KID-354)', () => {
    const scope = { channelAccountId: accountId, detailTargetProductIds: ['1'], absentProductIds: [] };
    expect(WingCatalogDetailsScopeSchema.parse(scope).via).toBe('manual');
    expect(WingCatalogDetailsScopeSchema.parse({ ...scope, via: 'list' }).via).toBe('list');
  });
});
