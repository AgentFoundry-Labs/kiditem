import { describe, expect, it, vi } from 'vitest';
import { ProductVariantAbcGradeReadAdapter } from './product-variant-abc-grade-read.adapter';

describe('ProductVariantAbcGradeReadAdapter', () => {
  it('reads only stored MasterProduct grades in the organization and maps null to an empty array', async () => {
    const prisma = { productVariant: { findMany: vi.fn().mockResolvedValue([
      { id: 'variant-a', masterProduct: { abcGrade: 'A' } },
      { id: 'variant-null', masterProduct: { abcGrade: null } },
    ]) } };
    const adapter = new ProductVariantAbcGradeReadAdapter(prisma as never);

    await expect(adapter.findAbcGradesByProductVariantIds({
      organizationId: 'org-1', productVariantIds: ['variant-null', 'variant-a', 'missing'],
    })).resolves.toEqual(new Map([
      ['missing', []], ['variant-a', ['A']], ['variant-null', []],
    ]));
    expect(prisma.productVariant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-1' }),
    }));
  });
});
