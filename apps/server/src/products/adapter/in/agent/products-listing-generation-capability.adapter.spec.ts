import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { ProductsListingGenerationCapabilityAdapter } from './products-listing-generation-capability.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const candidateId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';

describe('ProductsListingGenerationCapabilityAdapter', () => {
  it('enqueues one Products-owned durable operation for an existing candidate', async () => {
    const operations = {
      start: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000004',
        status: 'queued',
      }),
    };
    const adapter = new ProductsListingGenerationCapabilityAdapter(operations as never);
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
      operationRunId: '00000000-0000-4000-8000-000000000004',
      status: 'queued',
    });
    await adapter.createListingGenerationPackage(input);

    expect(operations.start).toHaveBeenCalledTimes(2);
    expect(operations.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      operationKey: 'products.generate_listing_package',
      triggerSource: 'agent',
      requestedByUserId: userId,
      idempotencyKey: input.idempotencyKey,
      input: expect.objectContaining({
        candidateId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.inputHash,
      }),
    }));
    expect(operations.start.mock.calls[0][0].input).toEqual(
      operations.start.mock.calls[1][0].input,
    );
  });
});
