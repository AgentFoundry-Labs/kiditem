import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TREND_EVIDENCE_SOURCE_KEYS,
  TrendEvidenceIngestionService,
} from '../trend-evidence-ingestion.service';

describe('TrendEvidenceIngestionService', () => {
  let repository: {
    findNaverKeywordHistory: ReturnType<typeof vi.fn>;
    find1688HotHistory: ReturnType<typeof vi.fn>;
    findShortsHistory: ReturnType<typeof vi.fn>;
  };
  let ledger: {
    startRun: ReturnType<typeof vi.fn>;
    appendObservations: ReturnType<typeof vi.fn>;
    finalizeRun: ReturnType<typeof vi.fn>;
  };
  let service: TrendEvidenceIngestionService;

  const BUSINESS_DATE = '2026-08-02';

  beforeEach(() => {
    repository = {
      findNaverKeywordHistory: vi.fn().mockResolvedValue([]),
      find1688HotHistory: vi.fn().mockResolvedValue([]),
      findShortsHistory: vi.fn().mockResolvedValue([]),
    };
    ledger = {
      startRun: vi.fn().mockResolvedValue({ kind: 'created', record: { id: 'run-1' } }),
      appendObservations: vi.fn().mockResolvedValue({ kind: 'appended' }),
      finalizeRun: vi.fn().mockResolvedValue({ kind: 'finalized' }),
    };
    service = new TrendEvidenceIngestionService(
      repository as never,
      ledger as never,
    );
  });

  it('1688 스냅샷을 supply 관측치로 적재하고 run 을 확정한다', async () => {
    repository.find1688HotHistory.mockResolvedValue([hot1688Row()]);

    const result = await service.ingest({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      businessDate: BUSINESS_DATE,
      sources: ['1688'],
    });

    expect(ledger.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: TREND_EVIDENCE_SOURCE_KEYS['1688'],
        runKey: `trend-collect:1688:${BUSINESS_DATE}`,
        expectedCount: 1,
      }),
    );
    const [{ observations }] = ledger.appendObservations.mock.calls[0];
    expect(observations[0]).toMatchObject({
      platform: '1688',
      signalRole: 'supply',
      granularity: 'supply_catalog',
      sourceEntityId: 'offer-9',
      // offerId 로 특정 오퍼를 지목하므로 후보 지지 주장이 성립한다.
      supportsCandidate: true,
    });
    expect(ledger.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'complete' }),
    );
    expect(result.sources[0]).toMatchObject({ ingested: 1, skippedReason: null });
  });

  it('키워드 집계는 후보를 지목하지 않으므로 supportsCandidate 를 주장하지 않는다', async () => {
    repository.findNaverKeywordHistory.mockResolvedValue([naverRow()]);

    await service.ingest({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      businessDate: BUSINESS_DATE,
      sources: ['naver'],
    });

    const [{ observations }] = ledger.appendObservations.mock.calls[0];
    expect(observations[0]).toMatchObject({
      platform: 'naver',
      signalRole: 'demand',
      granularity: 'aggregate_official',
      supportsCandidate: false,
    });
  });

  it('entitlement 이 없으면 사유를 남기고 건너뛴다 — 스스로 발급하지 않는다', async () => {
    repository.find1688HotHistory.mockResolvedValue([hot1688Row()]);
    ledger.startRun.mockRejectedValue(
      new BadRequestException({
        code: 'source_collection_not_authorized',
        reason: 'entitlement_missing',
      }),
    );

    const result = await service.ingest({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      businessDate: BUSINESS_DATE,
      sources: ['1688'],
    });

    expect(result.sources[0]).toMatchObject({
      ingested: 0,
      skippedReason: 'source_entitlement_missing:entitlement_missing',
    });
    expect(ledger.appendObservations).not.toHaveBeenCalled();
  });

  it('적재 도중 실패하면 run 을 collecting 으로 남기지 않고 격리한다', async () => {
    repository.find1688HotHistory.mockResolvedValue([hot1688Row()]);
    ledger.appendObservations.mockRejectedValue(new Error('payload rejected'));

    const result = await service.ingest({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      businessDate: BUSINESS_DATE,
      sources: ['1688'],
    });

    expect(ledger.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        status: 'quarantined',
        errorCode: 'trend_evidence_append_failed',
      }),
    );
    expect(result.sources[0].skippedReason).toContain('append_failed');
  });

  it('다른 영업일 스냅샷은 이 run 에 섞지 않는다', async () => {
    repository.find1688HotHistory.mockResolvedValue([
      hot1688Row(),
      hot1688Row({ offerId: 'offer-old', businessDate: new Date('2026-08-01T00:00:00.000Z') }),
    ]);

    await service.ingest({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      businessDate: BUSINESS_DATE,
      sources: ['1688'],
    });

    const [{ observations }] = ledger.appendObservations.mock.calls[0];
    expect(observations).toHaveLength(1);
    expect(observations[0].sourceEntityId).toBe('offer-9');
  });

  it('한 소스가 막혀도 나머지 소스는 계속 적재한다', async () => {
    repository.find1688HotHistory.mockResolvedValue([hot1688Row()]);
    repository.findNaverKeywordHistory.mockResolvedValue([naverRow()]);
    ledger.startRun.mockImplementation((input: { sourceKey: string }) =>
      input.sourceKey === TREND_EVIDENCE_SOURCE_KEYS.naver
        ? Promise.reject(
            new BadRequestException({
              code: 'source_collection_not_authorized',
              reason: 'kill_switch_enabled',
            }),
          )
        : Promise.resolve({ kind: 'created', record: { id: 'run-1' } }),
    );

    const result = await service.ingest({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      businessDate: BUSINESS_DATE,
      sources: ['naver', '1688'],
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].skippedReason).toContain('source_entitlement_missing');
    expect(result.sources[1]).toMatchObject({ ingested: 1, skippedReason: null });
  });

  it('해당 영업일 스냅샷이 없으면 run 을 열지 않는다', async () => {
    const result = await service.ingest({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      businessDate: BUSINESS_DATE,
      sources: ['shorts'],
    });

    expect(ledger.startRun).not.toHaveBeenCalled();
    expect(result.sources[0].skippedReason).toBe('no_snapshot_rows_for_business_date');
  });
});

function hot1688Row(overrides: Record<string, unknown> = {}) {
  return {
    businessDate: new Date('2026-08-02T00:00:00.000Z'),
    capturedAt: new Date('2026-08-02T01:00:00.000Z'),
    offerId: 'offer-9',
    sourceKeyword: '말랑이',
    rank: 1,
    title: '실리콘 말랑이',
    priceCny: 13.8,
    monthlySales: 900,
    repurchaseRate: '12%',
    tradeScore: '4.8',
    supplierName: 'Yiwu Happy Baby Co., Ltd.',
    imageUrl: null,
    sourceUrl: 'https://detail.1688.com/offer/9.html',
    ...overrides,
  };
}

function naverRow(overrides: Record<string, unknown> = {}) {
  return {
    keyword: '말랑이',
    businessDate: new Date('2026-08-02T00:00:00.000Z'),
    monthlyTotalSearchCount: 24_000,
    monthlyPcSearchCount: 4_000,
    monthlyMobileSearchCount: 20_000,
    competitionIndex: '높음',
    averageAdRank: 3,
    trendRatio: 1.4,
    trendDelta: 0.2,
    capturedAt: new Date('2026-08-02T01:00:00.000Z'),
    ...overrides,
  };
}
