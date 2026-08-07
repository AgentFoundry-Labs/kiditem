import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type Sourcing1688HotProductSnapshotRow,
  type NaverKeywordSnapshotRow,
  type ShortsSnapshotRow,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';
import {
  SourcingEvidenceLedgerService,
  type AppendSourcingEvidenceObservationInput,
} from './sourcing-evidence-ledger.service';

/**
 * 트렌드 수집 결과를 증거 원장(`SourcingEvidenceIngestionRun` + `SourcingEvidenceObservation`)에
 * 적재하는 어댑터.
 *
 * 이 서비스는 원장에 "관측 사실"을 기록할 뿐, 그 관측치가 결정에 쓰일 자격을 부여하지
 * 않는다. 자격 판정은 `evidenceIsAdmissible` 이 소유하며 다음을 모두 요구한다.
 *   - 소스에 검토 완료된 활성 entitlement (`qualified + enabled`)
 *   - 확정된 수집 run 과 최소 커버리지 충족
 *   - 관측치 conceptKey 와 LaunchCandidate 의 productConceptVersionKey 일치
 *   - supply 역할이면 SupplierOfferSnapshot 과 플랫폼·외부 식별자 대조
 *
 * 따라서 entitlement 가 없으면 이 어댑터는 해당 소스를 **건너뛰고 사유를 남긴다**.
 * 스스로 entitlement 를 만들지 않는다 — 그것은 검토된 법적/권한 산출물이고, 수집기가
 * 자기 데이터를 통과시키려고 발급하면 이 서브시스템이 존재하는 이유가 사라진다.
 */
export const TREND_EVIDENCE_SOURCE_KEYS = {
  naver: 'naver.datalab_keyword',
  '1688': '1688.hot_product',
  shorts: 'shorts.video_trend',
} as const;

export type TrendEvidenceSource = keyof typeof TREND_EVIDENCE_SOURCE_KEYS;

export const TREND_EVIDENCE_SCOPE_KEY = 'default';
export const TREND_EVIDENCE_COLLECTOR_VERSION = 'trend-collect.v1';
export const TREND_EVIDENCE_SCHEMA_VERSION = 'trend-observation.v1';

export interface TrendEvidenceIngestionSourceResult {
  source: TrendEvidenceSource;
  sourceKey: string;
  ingested: number;
  /** 건너뛴 경우의 기계 판독 사유. 성공이면 null. */
  skippedReason: string | null;
  runId: string | null;
}

export interface TrendEvidenceIngestionResult {
  businessDate: string;
  sources: TrendEvidenceIngestionSourceResult[];
}

@Injectable()
export class TrendEvidenceIngestionService {
  private readonly logger = new Logger(TrendEvidenceIngestionService.name);

  constructor(
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly repository: TrendCollectionRepositoryPort,
    private readonly ledger: SourcingEvidenceLedgerService,
  ) {}

  /**
   * 방금 수집한 businessDate 의 스냅샷을 원장에 적재한다. 소스 하나가 실패해도 나머지는
   * 계속 진행한다 — 수집 자체는 이미 끝났고, 적재 실패로 수집 결과를 잃으면 안 된다.
   */
  async ingest(input: {
    organizationId: string;
    triggeredByUserId: string;
    businessDate: string;
    sources: TrendEvidenceSource[];
    runKeyPrefix?: string;
  }): Promise<TrendEvidenceIngestionResult> {
    const sources: TrendEvidenceIngestionSourceResult[] = [];
    for (const source of input.sources) {
      sources.push(
        await this.ingestSource({
          source,
          organizationId: input.organizationId,
          triggeredByUserId: input.triggeredByUserId,
          businessDate: input.businessDate,
          runKeyPrefix: input.runKeyPrefix ?? 'trend-collect',
        }),
      );
    }
    return { businessDate: input.businessDate, sources };
  }

  private async ingestSource(input: {
    source: TrendEvidenceSource;
    organizationId: string;
    triggeredByUserId: string;
    businessDate: string;
    runKeyPrefix: string;
  }): Promise<TrendEvidenceIngestionSourceResult> {
    const sourceKey = TREND_EVIDENCE_SOURCE_KEYS[input.source];
    const base: TrendEvidenceIngestionSourceResult = {
      source: input.source,
      sourceKey,
      ingested: 0,
      skippedReason: null,
      runId: null,
    };

    let observations: AppendSourcingEvidenceObservationInput[];
    try {
      observations = await this.buildObservations(
        input.source,
        input.organizationId,
        input.businessDate,
      );
    } catch (error) {
      return { ...base, skippedReason: `snapshot_read_failed:${message(error)}` };
    }
    if (observations.length === 0) {
      return { ...base, skippedReason: 'no_snapshot_rows_for_business_date' };
    }

    // run 키는 (소스, 영업일) 당 하나. 같은 날 재수집해도 run 이 늘어나지 않는다.
    const runKey = `${input.runKeyPrefix}:${input.source}:${input.businessDate}`;
    let runId: string;
    try {
      const run = await this.ledger.startRun({
        organizationId: input.organizationId,
        sourceKey,
        runKey,
        scopeKey: TREND_EVIDENCE_SCOPE_KEY,
        collectorVersion: TREND_EVIDENCE_COLLECTOR_VERSION,
        triggeredByUserId: input.triggeredByUserId,
        expectedCount: observations.length,
      });
      runId = run.record.id;
    } catch (error) {
      // entitlement 미등록이 가장 흔한 경로다. 수집을 실패로 만들지 않고 사유만 남긴다.
      const reason = entitlementReason(error) ?? `run_start_failed:${message(error)}`;
      this.logger.warn(
        `[trend-evidence] ${sourceKey} 적재를 건너뜁니다 (${reason}). 소스 권한을 등록하면 적재가 시작됩니다.`,
      );
      return { ...base, skippedReason: reason };
    }

    try {
      await this.ledger.appendObservations({
        organizationId: input.organizationId,
        runId,
        observations,
      });
      await this.ledger.finalizeRun({
        organizationId: input.organizationId,
        runId,
        status: 'complete',
        watermarkEventAt: latestEventAt(observations),
      });
      return { ...base, ingested: observations.length, runId };
    } catch (error) {
      // 반쯤 적재된 run 을 collecting 으로 남기지 않는다. 닫아야 다음 run 이 시작된다.
      await this.quarantine(input.organizationId, runId, message(error));
      return { ...base, runId, skippedReason: `append_failed:${message(error)}` };
    }
  }

  private async quarantine(organizationId: string, runId: string, reason: string) {
    try {
      await this.ledger.finalizeRun({
        organizationId,
        runId,
        status: 'quarantined',
        errorCode: 'trend_evidence_append_failed',
        errorMessage: reason,
      });
    } catch (error) {
      this.logger.error(
        `[trend-evidence] run ${runId} 격리에 실패했습니다: ${message(error)}`,
      );
    }
  }

  private async buildObservations(
    source: TrendEvidenceSource,
    organizationId: string,
    businessDate: string,
  ): Promise<AppendSourcingEvidenceObservationInput[]> {
    if (source === 'naver') {
      const rows = await this.repository.findNaverKeywordHistory({
        organizationId,
        days: 1,
      });
      return rows
        .filter((row) => toDateString(row.businessDate) === businessDate)
        .map((row) => naverObservation(row, businessDate));
    }
    if (source === '1688') {
      const rows = await this.repository.find1688HotHistory({
        organizationId,
        days: 1,
      });
      return rows
        .filter((row) => toDateString(row.businessDate) === businessDate)
        .map((row) => hot1688Observation(row, businessDate));
    }
    const rows = await this.repository.findShortsHistory({
      organizationId,
      days: 1,
    });
    return rows
      .filter((row) => toDateString(row.businessDate) === businessDate)
      .map((row) => shortsObservation(row, businessDate));
  }
}

/**
 * 네이버 검색량은 키워드 단위 공식 집계다. 특정 후보를 지목하지 않으므로
 * `supportsCandidate` 는 false — 후보 게이트를 통과시키려면 운영자가 LaunchCandidate 를
 * 만들어 개념을 확정해야 한다.
 */
function naverObservation(
  row: NaverKeywordSnapshotRow,
  businessDate: string,
): AppendSourcingEvidenceObservationInput {
  const eventAt = row.businessDate;
  return {
    platform: 'naver',
    evidenceFamily: 'naver_keyword_demand',
    signalRole: 'demand',
    granularity: 'aggregate_official',
    conceptKey: row.keyword,
    sourceEntityType: 'keyword',
    sourceEntityId: row.keyword,
    schemaVersion: TREND_EVIDENCE_SCHEMA_VERSION,
    observationKey: `naver:keyword:${row.keyword}:${businessDate}`,
    supportsCandidate: false,
    eventAt,
    observedAt: row.capturedAt,
    availableAt: row.capturedAt,
    rawPayload: {
      keyword: row.keyword,
      businessDate,
      monthlyTotalSearchCount: row.monthlyTotalSearchCount,
      monthlyPcSearchCount: row.monthlyPcSearchCount,
      monthlyMobileSearchCount: row.monthlyMobileSearchCount,
      competitionIndex: row.competitionIndex,
      averageAdRank: row.averageAdRank,
      trendRatio: row.trendRatio,
      trendDelta: row.trendDelta,
    },
  };
}

/**
 * 1688 핫 상품은 offerId 로 특정 공급 오퍼를 지목하므로 후보 지지 주장이 성립한다.
 * 다만 실제 채택은 SupplierOfferSnapshot 대조(`evidenceIsAdmissible`)를 통과해야 한다.
 */
function hot1688Observation(
  row: Sourcing1688HotProductSnapshotRow,
  businessDate: string,
): AppendSourcingEvidenceObservationInput {
  return {
    platform: '1688',
    evidenceFamily: '1688_supplier_offer',
    signalRole: 'supply',
    granularity: 'supply_catalog',
    conceptKey: row.sourceKeyword,
    sourceEntityType: 'offer',
    sourceEntityId: row.offerId,
    schemaVersion: TREND_EVIDENCE_SCHEMA_VERSION,
    observationKey: `1688:offer:${row.offerId}:${businessDate}`,
    supportsCandidate: true,
    sourceUrl: row.sourceUrl,
    eventAt: row.businessDate,
    observedAt: row.capturedAt,
    availableAt: row.capturedAt,
    rawPayload: {
      offerId: row.offerId,
      sourceKeyword: row.sourceKeyword,
      businessDate,
      rank: row.rank,
      title: row.title,
      priceCny: row.priceCny,
      monthlySales: row.monthlySales,
      repurchaseRate: row.repurchaseRate,
      tradeScore: row.tradeScore,
      supplierName: row.supplierName,
      sourceUrl: row.sourceUrl,
    },
  };
}

/**
 * 쇼츠는 공식 집계가 아니라 파생 신호라 `inferred_observation` 으로 남긴다.
 */
function shortsObservation(
  row: ShortsSnapshotRow,
  businessDate: string,
): AppendSourcingEvidenceObservationInput {
  return {
    platform: 'youtube',
    evidenceFamily: 'shorts_video_trend',
    signalRole: 'demand',
    granularity: 'inferred_observation',
    conceptKey: row.keyword,
    sourceEntityType: 'video',
    sourceEntityId: row.videoKey,
    schemaVersion: TREND_EVIDENCE_SCHEMA_VERSION,
    observationKey: `shorts:video:${row.videoKey}:${businessDate}`,
    supportsCandidate: false,
    sourceUrl: row.videoUrl,
    eventAt: row.businessDate,
    observedAt: row.capturedAt,
    availableAt: row.capturedAt,
    rawPayload: {
      videoKey: row.videoKey,
      keyword: row.keyword,
      businessDate,
      rank: row.rank,
      title: row.title,
      channelName: row.channelName,
      viewCount: row.viewCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    },
  };
}

function latestEventAt(
  observations: AppendSourcingEvidenceObservationInput[],
): Date | null {
  return observations.reduce<Date | null>(
    (latest, observation) =>
      latest === null || observation.eventAt.getTime() > latest.getTime()
        ? observation.eventAt
        : latest,
    null,
  );
}

/** entitlement 미승인은 정상적인 건너뜀 경로다. 다른 오류와 구분해 사유를 남긴다. */
function entitlementReason(error: unknown): string | null {
  const response = (error as { response?: unknown } | null)?.response;
  if (response && typeof response === 'object' && 'code' in response) {
    const code = (response as { code?: unknown }).code;
    if (code === 'source_collection_not_authorized') {
      const reason = (response as { reason?: unknown }).reason;
      return typeof reason === 'string'
        ? `source_entitlement_missing:${reason}`
        : 'source_entitlement_missing';
    }
  }
  return null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
