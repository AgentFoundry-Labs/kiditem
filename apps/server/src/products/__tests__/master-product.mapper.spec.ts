import { describe, expect, it } from 'vitest';
import { MasterSchema } from '@kiditem/shared/product';
import { normalizeMasterTags, withImageRows } from '../mapper/master-product.mapper';
import { toSerializable } from '../util/serialize';

describe('normalizeMasterTags', () => {
  it('passes through string arrays', () => {
    expect(normalizeMasterTags(['toy', 'coupang'])).toEqual(['toy', 'coupang']);
  });

  it('drops non-string values from arrays', () => {
    expect(normalizeMasterTags(['toy', 1, null, 'kids'])).toEqual(['toy', 'kids']);
  });

  it('normalizes legacy object-shaped JSON tags to an empty array', () => {
    expect(normalizeMasterTags({})).toEqual([]);
  });

  it('keeps mapped master rows parseable by the shared master contract', () => {
    const row = {
      id: '1971761f-f30e-4388-99ba-72b93520c338',
      organizationId: '11111111-1111-4111-8111-111111111111',
      code: 'M-1',
      legacyCode: null,
      barcode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: {},
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
      lifecycleState: 'active',
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      processedData: null,
      draftContent: null,
      createdAt: new Date('2026-05-10T16:46:33.000Z'),
      updatedAt: new Date('2026-05-10T16:46:33.000Z'),
    } as Parameters<typeof withImageRows>[0];

    const mapped = MasterSchema.parse(toSerializable(withImageRows(row)));

    expect(mapped.tags).toEqual([]);
  });
});
