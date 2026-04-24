import { describe, expect, it } from 'vitest';
import {
  MasterImageItemSchema,
  MasterSchema,
  ProductCatalogDetailSchema,
  ProductCatalogListItemSchema,
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
