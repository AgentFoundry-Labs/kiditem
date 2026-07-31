import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdKeywordAgentService } from '../ad-keyword-agent.service';
import type {
  AdActionRepositoryPort,
  LatestTargetRow,
} from '../../port/out/repository/ad-action.repository.port';
import type { KeywordRelevanceJudgePort } from '../../port/out/cross-domain/keyword-relevance-judge.port';
import type { OperationAlertPort } from '../../port/out/cross-domain/operation-alert.port';

function keywordRow(overrides: Partial<LatestTargetRow> = {}): LatestTargetRow {
  return {
    id: 'target-1',
    targetType: 'keyword',
    targetKey: 'account:a:keyword:1::콩순이 비눗방울',
    listingId: 'listing-1',
    listingOptionId: 'listing-option-1',
    externalId: null,
    externalOptionId: '95514044205',
    campaignId: '104640375',
    campaignName: '쿠팡윙 집중광고',
    keyword: '콩순이 비눗방울',
    status: null,
    currentBid: null,
    dailyBudget: null,
    spend: 500,
    revenue: 0,
    impressions: 10,
    clicks: 1,
    conversions: 0,
    abcGrade: null,
    optionCommissionRate: null,
    productName: '캐릭터 문어발 비눗방울 1p',
    ...overrides,
  };
}

describe('AdKeywordAgentService', () => {
  let actionRepo: {
    findLatestTargetRows: ReturnType<typeof vi.fn>;
    createAdActionsFromCandidates: ReturnType<typeof vi.fn>;
  };
  let judge: { judge: ReturnType<typeof vi.fn> };
  let alerts: { start: ReturnType<typeof vi.fn> };
  let service: AdKeywordAgentService;

  beforeEach(() => {
    actionRepo = {
      findLatestTargetRows: vi.fn().mockResolvedValue([keywordRow()]),
      createAdActionsFromCandidates: vi
        .fn()
        .mockImplementation(async (_org, candidates) => candidates),
    };
    judge = { judge: vi.fn() };
    alerts = { start: vi.fn().mockResolvedValue(undefined) };
    service = new AdKeywordAgentService(
      actionRepo as unknown as AdActionRepositoryPort,
      judge as unknown as KeywordRelevanceJudgePort,
      alerts as unknown as OperationAlertPort,
    );
  });

  it('files an irrelevant keyword as a pause proposal awaiting approval', async () => {
    judge.judge.mockResolvedValue({
      text: JSON.stringify({
        verdicts: [
          {
            ref: 'p1k1',
            keyword: '콩순이 비눗방울',
            verdict: 'irrelevant',
            reason: '콩순이는 다른 완구 브랜드명',
          },
        ],
      }),
    });

    const result = await service.run({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
    const [, candidates] =
      actionRepo.createAdActionsFromCandidates.mock.calls[0];
    expect(candidates[0]).toMatchObject({
      actionType: 'pause_keyword',
      targetLabel: '콩순이 비눗방울',
    });
    // Proposals are queued for review; nothing is paused here.
    expect(alerts.start).toHaveBeenCalledTimes(1);
  });

  it('asks about one product per call, with that product in the prompt', async () => {
    actionRepo.findLatestTargetRows.mockResolvedValue([
      keywordRow(),
      keywordRow({
        id: 'target-2',
        externalOptionId: '90083778090',
        productName: '펌프 롱스틱 물총 3종 세트',
        keyword: '유아 물놀이 용품',
        spend: 0,
      }),
    ]);
    judge.judge.mockResolvedValue({ text: '{"verdicts":[]}' });

    const result = await service.run({
      organizationId: 'org-1',
      triggeredByUserId: null,
    });

    expect(judge.judge).toHaveBeenCalledTimes(2);
    expect(result.judgedProductCount).toBe(2);
    const prompts = judge.judge.mock.calls.map(([request]) => request.user);
    expect(prompts[0]).toContain('캐릭터 문어발 비눗방울 1p');
    expect(prompts[0]).toContain('콩순이 비눗방울');
    expect(prompts[0]).not.toContain('유아 물놀이 용품');
    expect(prompts[1]).toContain('펌프 롱스틱 물총 3종 세트');
  });

  it('narrows the run to one product when asked', async () => {
    actionRepo.findLatestTargetRows.mockResolvedValue([
      keywordRow(),
      keywordRow({
        id: 'target-2',
        externalOptionId: '90083778090',
        productName: '다른 상품',
        keyword: '다른 키워드',
      }),
    ]);
    judge.judge.mockResolvedValue({ text: '{"verdicts":[]}' });

    await service.run({
      organizationId: 'org-1',
      triggeredByUserId: null,
      externalOptionId: '90083778090',
    });

    expect(judge.judge).toHaveBeenCalledTimes(1);
    expect(judge.judge.mock.calls[0][0].user).toContain('다른 상품');
  });

  it('keeps the verdicts it already has when one product fails', async () => {
    actionRepo.findLatestTargetRows.mockResolvedValue([
      keywordRow({ spend: 9000 }),
      keywordRow({
        id: 'target-2',
        externalOptionId: 'other',
        productName: '실패 상품',
        keyword: '실패 키워드',
        spend: 1,
      }),
    ]);
    judge.judge
      .mockResolvedValueOnce({
        text: '{"verdicts":[{"ref":"p1k1","verdict":"irrelevant","reason":"다른 브랜드"}]}',
      })
      .mockRejectedValueOnce(new Error('model unavailable'));

    const result = await service.run({
      organizationId: 'org-1',
      triggeredByUserId: null,
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
    expect(result.failedProductCount).toBe(1);
    // A partial run must never read as a complete one.
    expect(result.reason).toContain('실패 1개 상품');
  });

  it('reports failure without proposing anything when every product fails', async () => {
    judge.judge.mockRejectedValue(new Error('AI_TEXT_MODEL is not set'));

    const result = await service.run({
      organizationId: 'org-1',
      triggeredByUserId: null,
    });

    expect(result.ok).toBe(false);
    expect(result.created).toBe(0);
    expect(actionRepo.createAdActionsFromCandidates).not.toHaveBeenCalled();
  });

  it('proposes nothing when the model invents a keyword it was never asked about', async () => {
    judge.judge.mockResolvedValue({
      text: '{"verdicts":[{"ref":"p9k9","verdict":"irrelevant","reason":"지어낸 근거"}]}',
    });

    const result = await service.run({
      organizationId: 'org-1',
      triggeredByUserId: null,
    });

    expect(result.created).toBe(0);
    expect(result.rejected).toEqual([{ ref: 'p9k9', reason: 'unknown_ref' }]);
    expect(actionRepo.createAdActionsFromCandidates).not.toHaveBeenCalled();
  });

  it('tells the operator to collect keywords first when there are none', async () => {
    actionRepo.findLatestTargetRows.mockResolvedValue([]);

    const result = await service.run({
      organizationId: 'org-1',
      triggeredByUserId: null,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('광고 키워드 수집');
    expect(judge.judge).not.toHaveBeenCalled();
  });

  it('keeps proposals when the alert fails', async () => {
    judge.judge.mockResolvedValue({
      text: '{"verdicts":[{"ref":"p1k1","verdict":"irrelevant","reason":"다른 브랜드"}]}',
    });
    alerts.start.mockRejectedValue(new Error('alert down'));

    const result = await service.run({
      organizationId: 'org-1',
      triggeredByUserId: null,
    });

    expect(result.ok).toBe(true);
    expect(result.created).toBe(1);
  });
});
