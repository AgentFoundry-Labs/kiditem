import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingAgentCommandService } from '../sourcing-agent-command.service';

function createSubject() {
  const candidates = {
    findActiveBySourceUrl: vi.fn().mockResolvedValue(null),
    upsertSourced: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
    upsertSourcedWithIdempotencyReceipt: vi.fn().mockResolvedValue({ candidateId: 'candidate-1' }),
  };
  const drafts = {
    createFromSource: vi.fn(),
    findDraftIdForSource: vi.fn().mockResolvedValue('draft-1'),
    findDraftIdsForSources: vi.fn(),
    getDraft: vi.fn(),
    retireForSource: vi.fn(),
  };
  const gateway = {
    registerUploadedDetailPage: vi.fn().mockResolvedValue({
      salesProductId: 'draft-1',
      detailGenerationId: 'uploaded-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }),
    startProductGeneration: vi.fn().mockResolvedValue({
      salesProductId: 'draft-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumbnail-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/candidate-1',
    }),
  };
  return {
    candidates,
    gateway,
    drafts,
    subject: new SourcingAgentCommandService(
      candidates as never,
      gateway as never,
      drafts as never,
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
        salesProductId: 'draft-1',
        sourceCandidateId: 'candidate-1',
        productBrief: expect.objectContaining({ productName: '자석 다트게임' }),
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
        salesProductId: 'draft-1',
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
        salesProductId: 'draft-1',
        sourceCandidateId: 'candidate-1',
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

  it('올린 상세페이지가 있으면 AI 를 돌리지 않는다 — 다른 데서 가져온 상품은 만들 것이 없다', async () => {
    // 사장님 2026-09-22: "상세페이지 섬네일 이미지 생성하지말고 등록하는 걸로".
    const { subject, gateway } = createSubject();

    const result = await subject.createProductGeneration(
      {
        title: '자석 다트게임',
        imageUrls: ['https://example.com/main.jpg'],
        detailPageImageUrls: ['https://example.com/detail-1.jpg', 'https://example.com/detail-2.jpg'],
      },
      'org-1',
      'user-1',
      { idempotencyKey: 'browser-key', requestHash: 'a'.repeat(64) },
    );

    expect(gateway.startProductGeneration).not.toHaveBeenCalled();
    expect(gateway.registerUploadedDetailPage).toHaveBeenCalledWith(
      expect.objectContaining({
        salesProductId: 'draft-1',
        detailPageImageUrls: ['https://example.com/detail-1.jpg', 'https://example.com/detail-2.jpg'],
      }),
    );
    expect(result.detailGenerationId).toBe('uploaded-1');
    // 썸네일도 만들지 않는다 — 생성이 돈 적이 없으니 null 이 사실이다.
    expect(result.thumbnailGenerationId).toBeNull();
  });

  it('상세페이지 칸이 비어 있으면 예전대로 AI 가 돈다', async () => {
    const { subject, gateway } = createSubject();

    await subject.createProductGeneration(
      { title: '자석 다트게임', imageUrls: ['https://example.com/main.jpg'], detailPageImageUrls: [] },
      'org-1',
      'user-1',
      { idempotencyKey: 'browser-key', requestHash: 'a'.repeat(64) },
    );

    expect(gateway.registerUploadedDetailPage).not.toHaveBeenCalled();
    expect(gateway.startProductGeneration).toHaveBeenCalledOnce();
  });
});