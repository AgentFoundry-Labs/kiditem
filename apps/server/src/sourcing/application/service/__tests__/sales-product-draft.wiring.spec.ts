import { describe, expect, it, vi } from 'vitest';
import { SourcingPromotionService } from '../sourcing-promotion.service';
import type { SalesProductDraftPort } from '../../port/out/cross-domain/sales-product-draft.port';

const ORG = 'org-1';
const CANDIDATE = 'candidate-1';

function setup(draft: Partial<SalesProductDraftPort> = {}) {
  const candidates = {
    runInTransaction: vi.fn(async (operation: (tx: unknown, ownerTx: unknown) => Promise<unknown>) =>
      operation({}, {})),
    lockCandidate: vi.fn(),
    findCandidateState: vi.fn().mockResolvedValue({ id: CANDIDATE, status: 'sourced' }),
    rejectCandidate: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const preparations = { assertCandidateTerminalTransitionAllowed: vi.fn() };
  const drafts = {
    createFromSource: vi.fn(),
    retireForSource: vi.fn().mockResolvedValue({ salesProductId: 'draft-1', retired: true, blockedReason: null }),
    ...draft,
  } as unknown as SalesProductDraftPort;
  return {
    drafts,
    service: new SourcingPromotionService(candidates as never, preparations as never, drafts),
  };
}

/** 후보를 거절하면 그 초안도 더 쓰지 않는다(KID-310). */
describe('SourcingPromotionService.reject', () => {
  it('sends the draft of the rejected candidate to unused', async () => {
    const { service, drafts } = setup();

    await expect(service.reject(CANDIDATE, ORG, {}, 'user-1'))
      .resolves.toEqual({ status: 'rejected', draftRetired: true });

    expect(drafts.retireForSource).toHaveBeenCalledWith(ORG, CANDIDATE);
  });

  it('still rejects the candidate when a mall holds its draft, and reports why', async () => {
    const { service } = setup({
      retireForSource: vi.fn().mockResolvedValue({
        salesProductId: 'draft-1',
        retired: false,
        blockedReason: '몰에 올라가 있어 판매상품을 미사용으로 내리지 않았습니다.',
      }),
    });

    const result = await service.reject(CANDIDATE, ORG, {}, 'user-1');

    expect(result.status).toBe('rejected');
    expect(result.draftRetired).toBe(false);
    expect(result.draftWarning).toContain('몰');
  });
});
