import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { ProductsListingGenerationCapabilityAdapter } from './products-listing-generation-capability.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const candidateId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';

describe('ProductsListingGenerationCapabilityAdapter', () => {
  it('delegates directly to the AI-owned generation job for an existing candidate', async () => {
    const productGeneration = {
      startForCandidate: vi.fn().mockResolvedValue({
        candidateId,
        detailGenerationId: '00000000-0000-4000-8000-000000000004',
        thumbnailGenerationId: '00000000-0000-4000-8000-000000000005',
        contentWorkspaceId: '00000000-0000-4000-8000-000000000006',
        href: `/product-pipeline/collected-products/${candidateId}`,
      }),
    };
    const adapter = new ProductsListingGenerationCapabilityAdapter(productGeneration as never);
    const businessInput = {
      candidateId,
      productName: 'Wooden blocks',
      imageUrls: ['https://example.test/block.jpg'],
      category: 'Toys',
      description: 'Stacking blocks',
      target: 'Ages 3+',
      optionNames: ['Blue', 'Red'],
      templateId: 'bold-vertical' as const,
      ageGroup: 'age-8-plus' as const,
      detailImageCount: '2' as const,
      usageSectionMode: 'include' as const,
      kcCertificationStatus: 'unknown' as const,
      task: 'all' as const,
    };
    const input = {
      organizationId,
      idempotencyKey: 'capability-invocation:00000000-0000-4000-8000-000000000004',
      inputHash: canonicalOwnerInputHash(businessInput),
      triggeredByUserId: userId,
      ...businessInput,
    };

    await expect(adapter.createListingGenerationPackage(input)).resolves.toEqual({
      candidateId,
      detailGenerationId: '00000000-0000-4000-8000-000000000004',
      thumbnailGenerationId: '00000000-0000-4000-8000-000000000005',
      contentWorkspaceId: '00000000-0000-4000-8000-000000000006',
      href: `/product-pipeline/collected-products/${candidateId}`,
    });
    await adapter.createListingGenerationPackage(input);

    expect(productGeneration.startForCandidate).toHaveBeenCalledTimes(2);
    expect(productGeneration.startForCandidate).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.inputHash,
      triggeredByUserId: userId,
      candidateId,
    }));
    expect(productGeneration.startForCandidate.mock.calls[0][0]).toEqual(
      productGeneration.startForCandidate.mock.calls[1][0],
    );
  });
});
