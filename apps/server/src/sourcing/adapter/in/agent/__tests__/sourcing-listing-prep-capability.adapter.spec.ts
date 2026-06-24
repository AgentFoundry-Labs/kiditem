import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import type { SourcingService } from '../../../application/service/sourcing.service';
import { SourcingListingPrepCapabilityAdapter } from '../sourcing-listing-prep-capability.adapter';

describe('SourcingListingPrepCapabilityAdapter', () => {
  it('registers a listing-prep capability that delegates to sourcing product generation', async () => {
    const registry = {
      register: vi.fn(),
    } as unknown as AgentCapabilityRegistry;
    const sourcing = {
      createProductGeneration: vi.fn().mockResolvedValue({
        candidateId: 'candidate-1',
        href: '/product-pipeline/collected-products/candidate-1',
        parentOperationKey: 'product-generation:batch-1',
        detailGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
        contentWorkspaceId: 'workspace-1',
      }),
    } as unknown as SourcingService;

    const adapter = new SourcingListingPrepCapabilityAdapter(registry, sourcing);
    adapter.onModuleInit();

    const handler = vi.mocked(registry.register).mock.calls[0]?.[0];
    expect(handler).toMatchObject({
      key: 'product_listing.create_generation_package',
      ownerDomain: 'sourcing',
      executionKind: 'workflow',
      sideEffects: ['db_write', 'job_enqueue'],
      approvalRisk: 'low',
    });

    const result = await handler.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-sourcing-1',
      agentType: 'sourcing',
      requestId: 'request-1',
      runId: 'run-1',
      requestedByUserId: 'user-1',
      input: {
        productName: '실리콘 흡착 식판',
        category: '유아식기',
        description: '흡착형 신제품',
        imageUrls: ['https://cdn.example.com/plate.jpg'],
        optionNames: ['베이지'],
      },
    });

    expect(sourcing.createProductGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '실리콘 흡착 식판',
        category: '유아식기',
        description: '흡착형 신제품',
        imageUrls: ['https://cdn.example.com/plate.jpg'],
        optionNames: ['베이지'],
        templateId: 'bold-vertical',
        detailImageCount: '2',
        usageSectionMode: 'include',
      }),
      'org-1',
      'user-1',
    );
    expect(result).toMatchObject({
      resourceType: 'sourcing_candidate',
      resourceId: 'candidate-1',
      outputSummary: {
        candidateId: 'candidate-1',
        detailGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
        contentWorkspaceId: 'workspace-1',
      },
      artifacts: [
        expect.objectContaining({
          artifactType: 'listing_prep_package',
          targetDomain: 'sourcing',
          targetModel: 'ProductGenerationPackage',
          targetId: 'candidate-1',
          title: '실리콘 흡착 식판 등록 준비 패키지',
          href: '/product-pipeline/collected-products/candidate-1',
        }),
      ],
    });
  });

  it('includes all generation-affecting inputs in the idempotency key', () => {
    const registry = {
      register: vi.fn(),
    } as unknown as AgentCapabilityRegistry;
    const sourcing = {
      createProductGeneration: vi.fn(),
    } as unknown as SourcingService;
    const adapter = new SourcingListingPrepCapabilityAdapter(registry, sourcing);
    adapter.onModuleInit();

    const handler = vi.mocked(registry.register).mock.calls[0]?.[0];
    const base = {
      productName: '실리콘 흡착 식판',
      imageUrls: ['https://cdn.example.com/plate.jpg'],
      optionNames: ['베이지'],
    };

    const defaultKey = handler.idempotencyKey({
      organizationId: 'org-1',
      input: base,
    });
    const templateKey = handler.idempotencyKey({
      organizationId: 'org-1',
      input: { ...base, templateId: 'kids-playful' },
    });
    const categoryKey = handler.idempotencyKey({
      organizationId: 'org-1',
      input: { ...base, category: '유아식기' },
    });

    expect(templateKey).not.toBe(defaultKey);
    expect(categoryKey).not.toBe(defaultKey);
  });
});
