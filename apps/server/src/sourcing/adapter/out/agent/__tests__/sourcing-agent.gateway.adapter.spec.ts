import { describe, expect, it, vi } from 'vitest';
import type { ProductGenerationAiTriggerPort } from '../../../../../ai/application/port/in/generation/product-generation-ai-trigger.port';
import { SourcingAgentGatewayAdapter } from '../sourcing-agent.gateway.adapter';

describe('SourcingAgentGatewayAdapter', () => {
  it('keeps deterministic AI product generation on its owner port', async () => {
    const productGeneration = {
      startForCandidate: vi.fn().mockResolvedValue({
        candidateId: 'candidate-1',
        detailGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumb-1',
        contentWorkspaceId: 'workspace-1',
        href: '/product-pipeline/collected-products/candidate-1',
      }),
    } as unknown as ProductGenerationAiTriggerPort;
    const adapter = new SourcingAgentGatewayAdapter(productGeneration);

    await expect(adapter.startProductGeneration({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      candidateId: 'candidate-1',
      productName: '자석 다트게임',
      imageUrls: ['https://example.com/main.jpg'],
      optionNames: ['기본'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
    })).resolves.toMatchObject({ candidateId: 'candidate-1' });

    expect(productGeneration.startForCandidate).toHaveBeenCalledOnce();
  });
});
