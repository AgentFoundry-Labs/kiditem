import { describe, expect, it, vi } from 'vitest';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { RegistrationDraftAdapter } from './registration-draft.adapter';

/**
 * 몰에 얼려 나가는 대표 사진은 그 판매상품의 사진이어야 한다(KID-310).
 *
 * AI 는 id 를 가진 선택만 자기 작업공간 소유인지 본다 — 맨 주소는 초안이 든 사진인지
 * 알 방법이 없어 그대로 채택한다. 그래서 얼리는 쪽인 Channels 가 막는다.
 */
describe('RegistrationDraftAdapter 대표 사진 울타리', () => {
  const TARGET = {
    id: 'target-1',
    organizationId: 'org-1',
    salesProductId: 'draft-1',
    channelAccountId: 'account-1',
    displayName: '상품',
    archivedAt: null,
    registrationInput: {},
    selectedThumbnailUrl: 'https://cdn.example.com/other/9.jpg',
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
    selectedDetailPageGenerationId: null,
    updatedAt: new Date('2026-09-23T00:00:00.000Z'),
  };

  function setup(draftImageUrls: string[], generatedUrls: string[]) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'draft-1' }]),
      registrationTarget: {
        findMany: vi.fn().mockResolvedValue([TARGET]),
        update: vi.fn().mockResolvedValue(TARGET),
      },
      salesProduct: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: 'draft-1', name: '상품', status: 'active', sourceRecordId: 'source-record-1',
          options: [{ id: 'option-1', salePrice: 1000, supplyStatus: 'selling' }],
        }),
        findFirst: vi.fn().mockResolvedValue({ imageUrls: draftImageUrls }),
      },
      productRegistrationExecution: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const contentWorkspaces = {
      ensureSalesProductWorkspace: vi.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      findSalesProductWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
      // 작업공간이 고른 대표 사진이 이 주소다.
      resolveSourceSelections: vi.fn().mockImplementation(async (_tx, input) => ({
        ...input, selectedThumbnailUrl: 'https://cdn.example.com/other/9.jpg',
      })),
      attachToListing: vi.fn(),
    };
    const thumbnails = { listGeneratedThumbnailUrls: vi.fn().mockResolvedValue(generatedUrls) };
    const adapter = new RegistrationDraftAdapter(contentWorkspaces as never, thumbnails as never);
    return { adapter, tx, handle: ownerTransaction(tx as never), thumbnails, contentWorkspaces };
  }

  const freeze = {
    organizationId: 'org-1',
    salesProductId: 'draft-1',
    channelAccountId: 'account-1',
    displayName: '상품',
    registrationInput: {},
    frozenHash: 'hash',
    requestedByUserId: null,
  };

  it('⭐ 이 상품의 것이 아닌 대표 사진은 얼리지 않는다', async () => {
    const { adapter, tx, handle, thumbnails } = setup(['https://cdn.example.com/draft/1.jpg'], []);

    await expect(adapter.freezeForSubmission(handle, freeze))
      .rejects.toThrow('대표 사진');

    expect(thumbnails.listGeneratedThumbnailUrls).toHaveBeenCalledWith('org-1', 'draft-1');
    expect(tx.registrationTarget.update).not.toHaveBeenCalled();
  });

  it('AI 가 이 상품을 위해 만든 썸네일은 통과시킨다', async () => {
    const { adapter, tx, handle } = setup([], ['https://cdn.example.com/other/9.jpg']);

    await adapter.freezeForSubmission(handle, freeze);

    expect(tx.registrationTarget.update).toHaveBeenCalled();
  });
});
