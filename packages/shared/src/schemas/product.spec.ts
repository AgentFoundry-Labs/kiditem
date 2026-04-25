import { describe, expect, it } from 'vitest';
import {
  GetMasterImagesResponseSchema,
  MasterImageItemSchema,
  MasterImageRoleSchema,
  MasterSchema,
  ProductCatalogDetailSchema,
  ProductCatalogListItemSchema,
  UpdateMasterImagesRequestSchema,
  UploadMasterImageResponseSchema,
} from './product.js';

const iso = '2026-04-24T00:00:00.000Z';

describe('product schemas', () => {
  it('accepts structured master image items', () => {
    expect(MasterImageItemSchema.parse({
      url: 'https://cdn.example.com/p.png',
      role: 'product',
      label: 'front',
      sortOrder: 0,
    })).toEqual({
      url: 'https://cdn.example.com/p.png',
      role: 'product',
      label: 'front',
      sortOrder: 0,
    });
  });

  it('rejects legacy string image arrays on shared write contract', () => {
    expect(() => MasterSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      code: 'M-00000001',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 0,
      thumbnailUrl: null,
      imageUrl: null,
      images: ['https://cdn.example.com/p.png'],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: null,
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      supplierId: null,
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: iso,
      updatedAt: iso,
    })).toThrow();
  });

  it('uses null ranges and zero counts for catalog rows without options', () => {
    const row = ProductCatalogListItemSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      code: 'M-00000001',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 0,
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: null,
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      supplierId: null,
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: iso,
      updatedAt: iso,
      optionCount: 0,
      representativeSku: null,
      priceRange: null,
      costRange: null,
      totalAvailableStock: 0,
    });
    expect(row.optionCount).toBe(0);
    expect(row.totalAvailableStock).toBe(0);
    expect(row.priceRange).toBeNull();
  });

  it('requires detail options to be an array', () => {
    const base = ProductCatalogListItemSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      code: 'M-00000001',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 0,
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: null,
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      supplierId: null,
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: iso,
      updatedAt: iso,
      optionCount: 0,
      representativeSku: null,
      priceRange: null,
      costRange: null,
      totalAvailableStock: 0,
    });
    expect(ProductCatalogDetailSchema.parse({ ...base, options: [] }).options).toEqual([]);
  });
});

describe('MasterImageRoleSchema (W1)', () => {
  it('accepts every documented role value', () => {
    for (const role of ['box', 'product', 'color_variant', 'size_chart', 'detail']) {
      expect(MasterImageRoleSchema.parse(role)).toBe(role);
    }
  });

  it('rejects unknown role values', () => {
    expect(() => MasterImageRoleSchema.parse('banner')).toThrow();
  });
});

describe('MasterImageItemSchema (W1)', () => {
  it('accepts null label', () => {
    const parsed = MasterImageItemSchema.parse({
      url: 'https://cdn.example.com/detail-1.jpg',
      role: 'detail',
      label: null,
      sortOrder: 3,
    });
    expect(parsed.label).toBeNull();
  });

  it('rejects an unknown role', () => {
    expect(() =>
      MasterImageItemSchema.parse({
        url: 'https://cdn.example.com/1.jpg',
        role: 'banner',
        label: null,
        sortOrder: 0,
      }),
    ).toThrow();
  });

  it('rejects a negative sortOrder', () => {
    expect(() =>
      MasterImageItemSchema.parse({
        url: 'https://cdn.example.com/1.jpg',
        role: 'product',
        label: null,
        sortOrder: -1,
      }),
    ).toThrow();
  });

  it('rejects a non-url string', () => {
    expect(() =>
      MasterImageItemSchema.parse({
        url: 'not-a-url',
        role: 'product',
        label: null,
        sortOrder: 0,
      }),
    ).toThrow();
  });
});

describe('image endpoint envelopes (W1)', () => {
  it('GetMasterImagesResponseSchema parses wrapped array', () => {
    const parsed = GetMasterImagesResponseSchema.parse({
      images: [
        { url: 'https://cdn.example.com/1.jpg', role: 'product', label: null, sortOrder: 0 },
      ],
    });
    expect(parsed.images).toHaveLength(1);
  });

  it('UpdateMasterImagesRequestSchema parses items array', () => {
    const parsed = UpdateMasterImagesRequestSchema.parse({
      items: [
        { url: 'https://cdn.example.com/1.jpg', role: 'detail', label: '상세', sortOrder: 0 },
      ],
    });
    expect(parsed.items[0].role).toBe('detail');
  });

  it('UploadMasterImageResponseSchema parses single image wrapper', () => {
    const parsed = UploadMasterImageResponseSchema.parse({
      image: { url: 'https://cdn.example.com/1.jpg', role: 'product', label: null, sortOrder: 0 },
    });
    expect(parsed.image.url).toBe('https://cdn.example.com/1.jpg');
  });
});
