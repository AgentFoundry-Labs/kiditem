import { Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  buildSourcingRisingProductModel,
  SOURCING_RISING_PRODUCT_MODEL_VERSION,
  type RisingSerpSnapshotInput,
  type RisingTrendInput,
  type RisingWingSalesInput,
  type SourcingRisingProductModelResult,
} from '../../domain/sourcing-rising-product-model';
import {
  COUPANG_MOMENTUM_PORT,
  type CoupangMomentumPort,
} from '../port/out/cross-domain/coupang-momentum.port';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';

const DEFAULT_WINDOW_DAYS = 14;
const MIN_WINDOW_DAYS = 2;
const MAX_WINDOW_DAYS = 60;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RISING_SCOPE = 'coupang_rising_products' as const;

export interface SourcingRisingProductDetectionInput {
  organizationId: string;
  windowDays?: number;
  limit?: number;
  /** When false, computes without writing the daily workspace snapshot. */
  persist?: boolean;
}

export interface SourcingRisingProductDetectionResult {
  businessDate: string;
  windowDays: number;
  generatedAt: string;
  confidence: number;
  dataGaps: string[];
  model: SourcingRisingProductModelResult;
}

/**
 * Deterministic replay-scorer: reads persisted Coupang SERP + Wing sales facts
 * (advertising) and Naver trend snapshots (sourcing), scores rising products,
 * and stores the ranked result as the `coupang_rising_products` workspace
 * snapshot. No live fetching and no LLM — judgement stays with the Agent OS run
 * that decides whether to call this capability.
 */
@Injectable()
export class SourcingRisingProductService {
  constructor(
    @Inject(COUPANG_MOMENTUM_PORT)
    private readonly momentum: CoupangMomentumPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trends: TrendCollectionRepositoryPort,
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
  ) {}

  async detect(
    input: SourcingRisingProductDetectionInput,
  ): Promise<SourcingRisingProductDetectionResult> {
    const windowDays = normalizeWindow(input.windowDays);
    const businessDateValue = kstBusinessDate(new Date());
    const todayBusinessDate = dateString(businessDateValue);

    const [serp, wing, naver] = await Promise.all([
      this.momentum.readSerpMomentum(input.organizationId, windowDays),
      this.momentum.readWingSalesMomentum(input.organizationId, windowDays),
      this.trends.findNaverKeywordHistory({
        organizationId: input.organizationId,
        days: windowDays,
      }),
    ]);

    const model = buildSourcingRisingProductModel({
      serpSnapshots: serp.map(toSerpInput),
      wingSales: wing.map(toWingInput),
      trends: naver.map(toTrendInput),
      todayBusinessDate,
      limit: input.limit,
    });

    const generatedAt = new Date().toISOString();
    const coverage = {
      serpSnapshotCount: serp.length,
      wingRowCount: wing.length,
      trendCount: naver.length,
      candidateCount: model.candidates.length,
    };

    if (input.persist !== false) {
      await this.snapshots.upsert({
        organizationId: input.organizationId,
        scope: RISING_SCOPE,
        businessDate: businessDateValue,
        payload: {
          version: SOURCING_RISING_PRODUCT_MODEL_VERSION,
          result: model as unknown as Record<string, unknown>,
          meta: { generatedAt, windowDays },
        },
      });
    }

    return {
      businessDate: todayBusinessDate,
      windowDays,
      generatedAt,
      confidence: confidenceFromCoverage(coverage),
      dataGaps: dataGaps(coverage),
      model,
    };
  }

  /** Return today's/most-recent persisted result, or compute one if none exists. */
  async latestOrDetect(
    input: SourcingRisingProductDetectionInput,
  ): Promise<SourcingRisingProductDetectionResult> {
    const latest = await this.getLatest(input.organizationId);
    if (latest) return latest;
    return this.detect(input);
  }

  /** Read the most recent persisted rising-product snapshot without recomputing. */
  async getLatest(
    organizationId: string,
    windowDays = 30,
  ): Promise<SourcingRisingProductDetectionResult | null> {
    const toBusinessDate = kstBusinessDate(new Date());
    const fromBusinessDate = new Date(
      toBusinessDate.getTime() - (windowDays - 1) * ONE_DAY_MS,
    );
    const rows = await this.snapshots.listRecent({
      organizationId,
      scope: RISING_SCOPE,
      fromBusinessDate,
      toBusinessDate,
      limit: 1,
    });
    const latest = rows[0];
    if (!latest) return null;
    const model = extractModel(latest.payload);
    if (!model) return null;
    const meta = latest.payload.meta;
    return {
      businessDate: dateString(latest.businessDate),
      windowDays: metaNumber(meta, 'windowDays') ?? DEFAULT_WINDOW_DAYS,
      generatedAt: metaString(meta, 'generatedAt') ?? latest.updatedAt.toISOString(),
      confidence: confidenceFromCoverage({
        serpSnapshotCount: model.stats.serpSnapshotCount,
        wingRowCount: model.stats.withWingSalesCount,
        trendCount: model.stats.keywordCount,
        candidateCount: model.stats.candidateCount,
      }),
      dataGaps: [],
      model,
    };
  }
}

function toSerpInput(row: Awaited<ReturnType<CoupangMomentumPort['readSerpMomentum']>>[number]): RisingSerpSnapshotInput {
  return {
    keyword: row.keyword,
    businessDate: row.businessDate,
    items: row.items.map((item) => ({
      isAd: item.isAd,
      rank: item.rank,
      productId: item.productId,
      vendorItemId: item.vendorItemId,
      name: item.name,
      priceKrw: item.priceKrw,
      reviewCount: item.reviewCount,
      ratingScore: item.ratingScore,
      link: item.link,
    })),
  };
}

function toWingInput(row: Awaited<ReturnType<CoupangMomentumPort['readWingSalesMomentum']>>[number]): RisingWingSalesInput {
  return {
    keyword: row.keyword,
    businessDate: row.businessDate,
    vendorItemId: row.vendorItemId,
    salesLast28d: row.salesLast28d,
    salesRank: row.salesRank,
    salePrice: row.salePrice,
    reviewCount: row.reviewCount,
  };
}

function toTrendInput(row: {
  keyword: string;
  trendDelta: number | null;
  monthlyTotalSearchCount: number | null;
}): RisingTrendInput {
  return {
    keyword: row.keyword,
    trendDelta: row.trendDelta,
    monthlyTotalSearchCount: row.monthlyTotalSearchCount,
  };
}

interface Coverage {
  serpSnapshotCount: number;
  wingRowCount: number;
  trendCount: number;
  candidateCount: number;
}

function confidenceFromCoverage(coverage: Coverage): number {
  const present = [
    coverage.serpSnapshotCount > 0,
    coverage.wingRowCount > 0,
    coverage.trendCount > 0,
    coverage.candidateCount > 0,
  ].filter(Boolean).length;
  return Math.round((present / 4) * 100) / 100;
}

function dataGaps(coverage: Coverage): string[] {
  const gaps: string[] = [];
  if (coverage.serpSnapshotCount === 0) gaps.push('coupang_serp_history_missing');
  if (coverage.wingRowCount === 0) gaps.push('wing_sales_history_missing');
  if (coverage.trendCount === 0) gaps.push('naver_trend_history_missing');
  if (coverage.candidateCount === 0) gaps.push('no_rising_candidates');
  return gaps;
}

function extractModel(payload: Record<string, unknown>): SourcingRisingProductModelResult | null {
  const result = payload.result;
  if (result == null || typeof result !== 'object' || Array.isArray(result)) return null;
  const candidate = result as Partial<SourcingRisingProductModelResult>;
  if (!Array.isArray(candidate.candidates) || candidate.stats == null || candidate.model == null) {
    return null;
  }
  return candidate as SourcingRisingProductModelResult;
}

function metaNumber(meta: unknown, key: string): number | null {
  if (meta == null || typeof meta !== 'object') return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metaString(meta: unknown, key: string): string | null {
  if (meta == null || typeof meta !== 'object') return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeWindow(windowDays: number | undefined): number {
  if (windowDays == null || !Number.isFinite(windowDays)) return DEFAULT_WINDOW_DAYS;
  return Math.max(MIN_WINDOW_DAYS, Math.min(MAX_WINDOW_DAYS, Math.floor(windowDays)));
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
