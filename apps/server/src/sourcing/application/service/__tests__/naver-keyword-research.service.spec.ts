import { describe, it, expect, vi } from 'vitest';
import { NaverKeywordResearchService } from '../naver-keyword-research.service';
import type {
  NaverAutocompleteKeywordPort,
  NaverDatalabPopularKeywordBoard,
  NaverDatalabPopularKeywordPort,
  NaverDatalabTrendPort,
  NaverKeywordResearchPort,
} from '../../port/out/provider/naver-keyword-research.port';
import type {
  NaverPopularKeywordSnapshotRow,
  TrendCollectionRepositoryPort,
} from '../../port/out/repository/trend-collection.repository.port';

function board(ranks: Array<{ rank: number; keyword: string }>): NaverDatalabPopularKeywordBoard {
  return {
    key: 'toys_dolls',
    label: '완구/인형',
    cid: 50000142,
    categoryPath: '출산/육아 > 완구/인형',
    date: '',
    datetime: '',
    range: '2026.07.07. ~ 2026.07.13.',
    ranks: ranks.map((r) => ({ ...r, linkId: null, categories: [] })),
    error: null,
  };
}

function priorRow(rank: number, keyword: string): NaverPopularKeywordSnapshotRow {
  return {
    boardKey: 'toys_dolls',
    boardLabel: '완구/인형',
    cid: '50000142',
    businessDate: new Date('2020-01-01T00:00:00.000Z'), // 항상 오늘 이전
    rank,
    keyword,
    linkId: null,
  };
}

function makeService(history: NaverPopularKeywordSnapshotRow[], boards: NaverDatalabPopularKeywordBoard[]) {
  const popular = {
    searchPopularKeywords: vi.fn(async () => ({
      source: 'naver-datalab-shopping-keyword-rank' as const,
      timeUnit: 'date' as const,
      startDate: '2026-07-07',
      endDate: '2026-07-13',
      device: null,
      gender: null,
      ages: [],
      generatedAt: new Date().toISOString(),
      boards,
    })),
  } as unknown as NaverDatalabPopularKeywordPort;
  const trendRepo = {
    findPopularKeywordHistory: vi.fn(async () => history),
    upsertNaverPopularKeywordSnapshots: vi.fn(async () => boards[0].ranks.length),
  } as unknown as TrendCollectionRepositoryPort;
  const noop = {} as unknown;
  const service = new NaverKeywordResearchService(
    noop as NaverKeywordResearchPort,
    noop as NaverDatalabTrendPort,
    popular,
    noop as NaverAutocompleteKeywordPort,
    trendRepo,
  );
  return { service, trendRepo };
}

describe('NaverKeywordResearchService.searchPopularKeywords NEW/급상승', () => {
  it('직전 저장일과 비교해 신규/상승/하락을 채운다', async () => {
    const { service, trendRepo } = makeService(
      [priorRow(1, '토미카'), priorRow(2, '레고')],
      [board([
        { rank: 1, keyword: '레고' }, // 이전 2위 → 상승(+1)
        { rank: 2, keyword: '신상완구' }, // 이전에 없음 → 신규
        { rank: 3, keyword: '토미카' }, // 이전 1위 → 하락(-2)
      ])],
    );

    const result = await service.searchPopularKeywords({ boardKeys: ['toys_dolls'] }, 'org-1');
    const ranks = result.boards[0].ranks;

    expect(ranks[0]).toMatchObject({ keyword: '레고', isNew: false, previousRank: 2, rankDelta: 1 });
    expect(ranks[1]).toMatchObject({ keyword: '신상완구', isNew: true, previousRank: null, rankDelta: null });
    expect(ranks[2]).toMatchObject({ keyword: '토미카', isNew: false, previousRank: 1, rankDelta: -2 });

    // 오늘 순위를 일별 스냅샷으로 저장한다
    expect(trendRepo.upsertNaverPopularKeywordSnapshots).toHaveBeenCalledOnce();
    const savedRows = (trendRepo.upsertNaverPopularKeywordSnapshots as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedRows).toHaveLength(3);
    expect(savedRows[0]).toMatchObject({ organizationId: 'org-1', boardKey: 'toys_dolls', keyword: '레고', rank: 1 });
  });

  it('직전 데이터가 없으면 신규로 오인하지 않는다(전부 isNew=false)', async () => {
    const { service } = makeService([], [board([{ rank: 1, keyword: '레고' }])]);
    const result = await service.searchPopularKeywords({ boardKeys: ['toys_dolls'] }, 'org-1');
    expect(result.boards[0].ranks[0]).toMatchObject({ isNew: false, previousRank: null, rankDelta: null });
  });

  it('저장소가 실패해도 순위 조회는 그대로 반환한다', async () => {
    const { service, trendRepo } = makeService([], [board([{ rank: 1, keyword: '레고' }])]);
    (trendRepo.findPopularKeywordHistory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
    const result = await service.searchPopularKeywords({ boardKeys: ['toys_dolls'] }, 'org-1');
    expect(result.boards[0].ranks[0].keyword).toBe('레고');
  });
});
