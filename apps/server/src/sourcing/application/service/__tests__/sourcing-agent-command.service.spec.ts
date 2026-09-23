import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingAgentCommandService } from '../sourcing-agent-command.service';

function createSubject() {
  const records = {
    runInTransaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) => work({ owner: true })),
    runOnce: vi.fn(async (_receipt: unknown, work: (transaction: unknown) => Promise<unknown>) => work({ owner: true })),
  };
  const drafts = {
    findForSourceRecord: vi.fn(),
    createDraft: vi.fn().mockResolvedValue({ salesProductId: 'draft-1' }),
    getDraft: vi.fn(),
  };
  const gateway = {
    registerUploadedDetailPage: vi.fn().mockResolvedValue({
      salesProductId: 'draft-1',
      detailGenerationId: 'uploaded-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/draft-1',
    }),
    startProductGeneration: vi.fn().mockResolvedValue({
      salesProductId: 'draft-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumbnail-1',
      contentWorkspaceId: 'workspace-1',
      href: '/product-pipeline/collected-products/draft-1',
    }),
  };
  return {
    records,
    gateway,
    drafts,
    subject: new SourcingAgentCommandService(
      records as never,
      gateway as never,
      drafts as never,
    ),
  };
}

describe('SourcingAgentCommandService', () => {
  it('rejects a reused product-generation key whose receipt hash conflicts', async () => {
    const { subject, records, gateway } = createSubject();
    records.runOnce.mockRejectedValueOnce(
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