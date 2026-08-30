import { describe, expect, it, vi } from 'vitest';
import { SourcingAgentCommandService } from '../sourcing-agent-command.service';

function createSubject() {
  const candidates = {
    findActiveBySourceUrl: vi.fn().mockResolvedValue(null),
    upsertSourced: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
  };
  const gateway = {
    startProductGeneration: vi.fn().mockResolvedValue({
      candidateId: 'candidate-1',
      parentOperationKey: 'product-generation:batch-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumbnail-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }),
  };
  return {
    candidates,
    gateway,
    subject: new SourcingAgentCommandService(
      candidates as never,
      gateway as never,
    ),
  };
}

describe('SourcingAgentCommandService', () => {
  it('owns manual registration and starts product generation exactly once', async () => {
    const { subject, candidates, gateway } = createSubject();

    const result = await subject.createProductGeneration(
      {
        title: '자석 다트게임',
        imageUrls: ['https://example.com/main.jpg'],
      },
      'org-1',
      'user-1',
    );

    expect(candidates.upsertSourced).toHaveBeenCalledOnce();
    expect(gateway.startProductGeneration).toHaveBeenCalledOnce();
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        triggeredByUserId: 'user-1',
        candidateId: 'candidate-1',
        productName: '자석 다트게임',
      }),
    );
    expect(result.candidateId).toBe('candidate-1');
  });
});
