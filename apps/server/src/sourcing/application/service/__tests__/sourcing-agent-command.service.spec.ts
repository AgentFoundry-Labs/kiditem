import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingAgentCommandService } from '../sourcing-agent-command.service';

function createSubject() {
  const candidates = {
    findActiveBySourceUrl: vi.fn().mockResolvedValue(null),
    upsertSourced: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
    upsertSourcedWithIdempotencyReceipt: vi.fn().mockResolvedValue({ candidateId: 'candidate-1' }),
  };
  const gateway = {
    startProductGeneration: vi.fn().mockResolvedValue({
      candidateId: 'candidate-1',
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
  it('fences manual candidate creation and AI children with one caller idempotency coordinate', async () => {
    const { subject, candidates, gateway } = createSubject();

    const result = await subject.createProductGeneration(
      {
        title: '자석 다트게임',
        imageUrls: ['https://example.com/main.jpg'],
      },
      'org-1',
      'user-1',
      { idempotencyKey: 'browser-key', requestHash: 'a'.repeat(64) },
    );

    expect(candidates.upsertSourcedWithIdempotencyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'sourcing.product_generation',
        idempotencyKey: 'browser-key',
        requestHash: 'a'.repeat(64),
      }),
    );
    expect(candidates.upsertSourced).not.toHaveBeenCalled();
    expect(gateway.startProductGeneration).toHaveBeenCalledOnce();
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        triggeredByUserId: 'user-1',
        candidateId: 'candidate-1',
        productName: '자석 다트게임',
        idempotencyKey: 'browser-key',
        requestHash: 'a'.repeat(64),
      }),
    );
    expect(result.candidateId).toBe('candidate-1');
  });

  it('reuses the receipt candidate and durable child coordinate after a lost enqueue response', async () => {
    const { subject, candidates, gateway } = createSubject();
    const coordinate = { idempotencyKey: 'browser-key', requestHash: 'a'.repeat(64) };
    const input = {
      title: '자석 다트게임',
      imageUrls: ['https://example.com/main.jpg'],
    };
    gateway.startProductGeneration
      .mockRejectedValueOnce(new Error('thumbnail_enqueue_failed'))
      .mockResolvedValueOnce({
        candidateId: 'candidate-1',
        detailGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
        contentWorkspaceId: 'workspace-1',
        href: '/product-pipeline/collected-products/candidate-1',
      });

    await expect(subject.createProductGeneration(input, 'org-1', 'user-1', coordinate))
      .rejects.toThrow('thumbnail_enqueue_failed');
    await expect(subject.createProductGeneration(input, 'org-1', 'user-1', coordinate))
      .resolves.toMatchObject({
        candidateId: 'candidate-1',
        detailGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
      });

    expect(candidates.upsertSourcedWithIdempotencyReceipt).toHaveBeenCalledTimes(2);
    expect(gateway.startProductGeneration).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining(coordinate),
    );
    expect(gateway.startProductGeneration).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ...coordinate,
        candidateId: 'candidate-1',
      }),
    );
  });

  it('rejects a reused product-generation key whose receipt hash conflicts', async () => {
    const { subject, candidates, gateway } = createSubject();
    candidates.upsertSourcedWithIdempotencyReceipt.mockRejectedValueOnce(
      new Error('owner_idempotency_input_conflict'),
    );

    await expect(subject.createProductGeneration(
      { title: '자석 다트게임', imageUrls: ['https://example.com/main.jpg'] },
      'org-1',
      'user-1',
      { idempotencyKey: 'browser-key', requestHash: 'b'.repeat(64) },
    )).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.startProductGeneration).not.toHaveBeenCalled();
  });
});
