import { Inject, Injectable, Logger } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
  type SourcingWorkspaceSnapshotRow,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';
import {
  SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
  type SourcingInterestTargetRepositoryPort,
} from '../port/out/repository/sourcing-interest-target.repository.port';
import {
  buildEntryRecommendations,
  type EntryInterestKeyword,
  type EntryPopularKeyword,
  type EntryRecommendationResult,
  type EntryRisingCandidate,
  type EntrySupplyItem,
} from '../../domain/sourcing-entry-recommendation';

/** 스냅샷을 거슬러 올라가며 찾는 최대 일수. 이 창을 넘으면 "데이터 없음"으로 본다. */
const SNAPSHOT_LOOKBACK_DAYS = 45;
/** 인기 키워드 신규 진입 판정에는 최신 두 일자만 있으면 된다. 여유 있게 14일을 읽는다. */
const KEYWORD_LOOKBACK_DAYS = 14;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface GetEntryRecommendationsInput {
  organizationId: string;
  limit?: number;
}

/**
 * 초기 진입 후보 표를 만든다.
 *
 * 키워드를 입력받지 않는다 — 운영자가 뭘 쳐야 할지 아는 상태를 전제하지 않고,
 * 이미 수집된 네 소스에서 바로 상품을 올린다.
 *
 * 소스가 비어 있어도 예외를 던지지 않고 `dataGaps` 로 이유를 돌려준다. 화면이
 * 빈 표와 "왜 비었는지" 를 같이 보여줄 수 있어야 하기 때문이다.
 */
@Injectable()
export class SourcingEntryRecommendationService {
  private readonly logger = new Logger(SourcingEntryRecommendationService.name);

  constructor(
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trends: TrendCollectionRepositoryPort,
    @Inject(SOURCING_INTEREST_TARGET_REPOSITORY_PORT)
    private readonly interests: SourcingInterestTargetRepositoryPort,
  ) {}

  async getRecommendations(
    input: GetEntryRecommendationsInput,
  ): Promise<EntryRecommendationResult> {
    const { organizationId } = input;
    const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
    // 스냅샷은 KST 영업일(UTC 자정 Date)로 저장된다. 여기서 raw `new Date()` 를 쓰면
    // 00:00~09:00 KST 구간에 UTC 날짜가 하루 뒤처져 **오늘 쓴 스냅샷이 조회에서 빠진다**
    // (방금 수집했는데 표가 어제 것을 보여주고 경과일을 0일로 적는 증상).
    const today = kstBusinessDate(new Date());

    const [supplySnapshot, risingSnapshot, popularKeywordRows, interestKeywords] = await Promise.all([
      this.findLatestSnapshot(organizationId, '1688_new_products', today),
      this.findLatestSnapshot(organizationId, 'coupang_rising_products', today),
      this.trends
        .findPopularKeywordHistory({ organizationId, days: KEYWORD_LOOKBACK_DAYS })
        .catch((error: unknown) => {
          // 키워드는 보조 신호다. 실패해도 표 자체는 만들 수 있어야 한다.
          this.logger.warn(`인기 키워드 조회 실패: ${describeError(error)}`);
          return [];
        }),
      this.loadInterestKeywords(organizationId),
    ]);

    const popularKeywords: EntryPopularKeyword[] = popularKeywordRows.map((row) => ({
      keyword: row.keyword,
      boardKey: row.boardKey,
      boardLabel: row.boardLabel,
      businessDate: row.businessDate,
      rank: row.rank,
    }));

    return buildEntryRecommendations({
      supplyItems: readSupplyItems(supplySnapshot),
      risingCandidates: readRisingCandidates(risingSnapshot),
      popularKeywords,
      interestKeywords,
      supplyBusinessDate: toDateKey(supplySnapshot?.businessDate ?? null),
      risingBusinessDate: toDateKey(risingSnapshot?.businessDate ?? null),
      today,
      limit,
    });
  }

  /**
   * 운영자가 등록한 관심 키워드를 두 곳에서 모은다.
   *
   * - `SourcingInterestTarget`: 키워드 분석 화면에서 "관심 키워드로 저장"한 것
   * - `trend_seed_keywords`: 트렌드 수집 시드로 등록한 것(비활성 시드는 제외)
   *
   * 한쪽이 실패해도 나머지로 분류는 할 수 있어야 하므로 각각 따로 감싼다.
   */
  private async loadInterestKeywords(
    organizationId: string,
  ): Promise<EntryInterestKeyword[]> {
    const [saved, seeds] = await Promise.all([
      this.interests.list(organizationId).catch((error: unknown) => {
        this.logger.warn(`관심 키워드 조회 실패: ${describeError(error)}`);
        return [];
      }),
      this.trends.listSeeds(organizationId).catch((error: unknown) => {
        this.logger.warn(`트렌드 시드 조회 실패: ${describeError(error)}`);
        return [];
      }),
    ]);

    const keywords: EntryInterestKeyword[] = [];

    for (const target of saved) {
      // 관심 대상은 키워드/카테고리/상품이 섞여 있다. 키워드만 분류에 쓴다.
      if (target.targetType !== 'keyword') continue;
      const keyword = asNonEmptyString(target.keyword) ?? asNonEmptyString(target.label);
      if (keyword) keywords.push({ keyword, origin: 'saved' });
    }

    for (const seed of seeds) {
      if (!seed.enabled) continue;
      const keyword = seed.keyword?.trim();
      if (keyword) keywords.push({ keyword, origin: 'seed' });
    }

    return keywords;
  }

  /**
   * 오늘자 스냅샷이 없는 날이 잦으므로 최근 것부터 거슬러 찾는다.
   * 오늘 것만 보면 수집이 하루라도 밀린 순간 화면이 통째로 빈다.
   */
  private async findLatestSnapshot(
    organizationId: string,
    scope: '1688_new_products' | 'coupang_rising_products',
    today: Date,
  ): Promise<SourcingWorkspaceSnapshotRow | null> {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - SNAPSHOT_LOOKBACK_DAYS);

    const rows = await this.snapshots.listRecent({
      organizationId,
      scope,
      fromBusinessDate: from,
      toBusinessDate: today,
      limit: SNAPSHOT_LOOKBACK_DAYS,
    });

    if (rows.length === 0) return null;
    return rows.reduce((latest, row) =>
      row.businessDate.getTime() > latest.businessDate.getTime() ? row : latest,
    );
  }
}

/** `payload.result.items` 배열만 신뢰하고, 모양이 다르면 조용히 빈 배열로 떨어뜨린다. */
function readSupplyItems(snapshot: SourcingWorkspaceSnapshotRow | null): EntrySupplyItem[] {
  const items = readArray(snapshot, 'items');
  return items.filter(isRecord) as EntrySupplyItem[];
}

function readRisingCandidates(
  snapshot: SourcingWorkspaceSnapshotRow | null,
): EntryRisingCandidate[] {
  const items = readArray(snapshot, 'candidates');
  return items.filter(isRecord) as EntryRisingCandidate[];
}

function readArray(snapshot: SourcingWorkspaceSnapshotRow | null, key: string): unknown[] {
  if (!snapshot) return [];
  const result = (snapshot.payload as Record<string, unknown> | undefined)?.result;
  if (!isRecord(result)) return [];
  const value = result[key];
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateKey(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
