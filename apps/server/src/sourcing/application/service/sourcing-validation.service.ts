import { Inject, Injectable } from '@nestjs/common';
import { evaluateValidationEconomics } from '../../domain/sourcing-validation-policy';
import {
  SOURCING_RECOMMENDATION_REPOSITORY_PORT,
  type SourcingRecommendationRunGraph,
  type SourcingRecommendationRepositoryPort,
} from '../port/out/repository/sourcing-recommendation.repository.port';
import {
  SOURCING_VALIDATION_REPOSITORY_PORT,
  type SourcingValidationCheckStatus,
  type SourcingValidationEpisodeStatus,
  type SourcingValidationEpisodeWrite,
  type SourcingValidationItemRecord,
  type SourcingValidationItemView,
  type SourcingValidationRepositoryPort,
} from '../port/out/repository/sourcing-validation.repository.port';

const VALIDATION_POLICY_KEY = 'sourcing_validation' as const;
const VALIDATION_POLICY_VERSION = '2026-08-10';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface SourcingValidationEnvelope {
  status: 'ready' | 'collecting' | 'stale' | 'unavailable';
  generatedAt: string;
  lastSuccessfulAt: string | null;
  freshUntil: string | null;
  operationId: string | null;
  warnings: Array<{ code: string; message: string }>;
  error: { code: string; retryable: boolean; message: string } | null;
  data: {
    recommendationRunId: string;
    items: SourcingValidationItemView[];
    nextCursor: string | null;
  } | null;
}

@Injectable()
export class SourcingValidationService {
  constructor(
    @Inject(SOURCING_RECOMMENDATION_REPOSITORY_PORT)
    private readonly recommendations: SourcingRecommendationRepositoryPort,
    @Inject(SOURCING_VALIDATION_REPOSITORY_PORT)
    private readonly validations: SourcingValidationRepositoryPort,
  ) {}

  async latest(input: {
    organizationId: string;
    limit?: number;
    cursor?: string;
  }): Promise<SourcingValidationEnvelope> {
    const now = new Date();
    const run = await this.recommendations.findLatest({
      organizationId: input.organizationId,
      now,
    });
    if (!run) return unavailable(now, 'RECOMMENDATION_RUN_MISSING');

    const page = await this.validations.listForRun({
      organizationId: input.organizationId,
      recommendationRunId: run.id,
      limit: normalizeLimit(input.limit),
      cursor: input.cursor,
    });
    if (run.items.length > 0 && page.items.length === 0) {
      return unavailable(now, 'VALIDATION_EPISODES_MISSING');
    }
    return ready(run, page.items, page.nextCursor);
  }

  async refresh(input: {
    organizationId: string;
    limit?: number;
  }): Promise<SourcingValidationEnvelope> {
    const now = new Date();
    const run = await this.recommendations.findLatest({
      organizationId: input.organizationId,
      now,
    });
    if (!run) return unavailable(now, 'RECOMMENDATION_RUN_MISSING');

    return this.refreshResolvedRun({
      organizationId: input.organizationId,
      run,
      limit: normalizeLimit(input.limit),
      now,
    });
  }

  async refreshForRun(input: {
    organizationId: string;
    recommendationRunId: string;
    idempotencyKey?: string;
    requestHash?: string;
    limit?: number;
  }): Promise<SourcingValidationEnvelope> {
    const now = new Date();
    const run = await this.recommendations.findById({
      organizationId: input.organizationId,
      id: input.recommendationRunId,
    });
    if (!run) return unavailable(now, 'RECOMMENDATION_RUN_MISSING');

    return this.refreshResolvedRun({
      organizationId: input.organizationId,
      run,
      limit: normalizeLimit(input.limit),
      now,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });
  }

  private async refreshResolvedRun(input: {
    organizationId: string;
    run: SourcingRecommendationRunGraph;
    limit: number;
    now: Date;
    idempotencyKey?: string;
    requestHash?: string;
  }): Promise<SourcingValidationEnvelope> {
    const supplyItems = input.run.items.filter((item) => item.sourcePlatform === '1688');
    const validationItems = supplyItems.length > 0 ? supplyItems : input.run.items;
    const episodes = validationItems
      .slice(0, input.limit)
      .map((item) => buildEpisode(item, input.now));
    const items = episodes.length === 0
      ? []
      : await this.validations.replaceForRun({
          organizationId: input.organizationId,
          recommendationRunId: input.run.id,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          episodes,
        });
    return ready(input.run, items, null);
  }
}

function buildEpisode(
  item: SourcingRecommendationRunGraph['items'][number],
  cutoffAt: Date,
): SourcingValidationEpisodeWrite {
  const source = recordValue(item.sourceSnapshot);
  const economics = evaluateValidationEconomics({
    offerPriceCny: numberOrNull(source.overseasPriceCny ?? source.priceCny),
    exchangeRate: numberOrNull(source.exchangeRate),
    internationalShippingKrw: integerOrNull(source.internationalShippingKrw),
    marketplaceFeeBps: integerOrNull(source.marketplaceFeeBps),
    targetSalePriceKrw: integerOrNull(source.salePriceKrw),
  });
  const evidenceObservationIds = compactIds(item.evidenceObservationIds);
  const isSupplierOffer = item.sourcePlatform === '1688';
  const hasCoupangDemand = item.sourcePlatform === 'coupang'
    || recordValue(source.coupang).productId != null;
  const hasCompetition = Number.isFinite(item.scoreComponents.competition);
  const hasOfferIdentity = isSupplierOffer
    && Boolean(item.externalOfferId.trim())
    && evidenceObservationIds.length > 0;
  const hasPriceAndMoq = numberOrNull(source.overseasPriceCny ?? source.priceCny) !== null
    && numberOrNull(source.minOrderQuantity) !== null;
  const observationWindowDays = numberOrNull(source.observationWindowDays);

  const checks = [
    check('coupang_demand', hasCoupangDemand ? 'pass' : 'missing',
      hasCoupangDemand ? '쿠팡 수요 관측이 연결되었습니다.' : '연결된 쿠팡 수요 관측이 없습니다.',
      evidenceObservationIds),
    check('competition', hasCompetition ? 'pass' : 'missing',
      hasCompetition ? '추천 계산의 경쟁 지표가 있습니다.' : '경쟁 지표가 없습니다.',
      evidenceObservationIds),
    check('offer_identity', isSupplierOffer
      ? hasOfferIdentity ? 'pass' : 'missing'
      : 'not_applicable',
    isSupplierOffer
      ? hasOfferIdentity ? '외부 offer 식별자와 근거가 고정되었습니다.' : '외부 offer 식별자 또는 근거가 없습니다.'
      : '공급 offer가 없는 수요 관측입니다.',
    evidenceObservationIds),
    check('price_moq', isSupplierOffer
      ? hasPriceAndMoq ? 'pass' : 'missing'
      : 'not_applicable',
    isSupplierOffer
      ? hasPriceAndMoq ? '가격과 MOQ가 있습니다.' : '가격 또는 MOQ가 없습니다.'
      : '공급 offer가 없는 수요 관측입니다.',
    evidenceObservationIds),
    check('supplier_freshness', isSupplierOffer
      ? evidenceObservationIds.length > 0 ? 'pass' : 'missing'
      : 'not_applicable',
    isSupplierOffer
      ? evidenceObservationIds.length > 0 ? '수집 근거가 보존되어 있습니다.' : '공급 수집 근거가 없습니다.'
      : '공급 offer가 없는 수요 관측입니다.',
    evidenceObservationIds),
    check('landed_cost', economics.status === 'ready_for_review' ? 'pass' : 'missing',
      economics.status === 'ready_for_review'
        ? `예상 원가 ${economics.landedCostKrw.toLocaleString('ko-KR')}원입니다.`
        : `계산에 필요한 값이 없습니다: ${economics.missingCodes.join(', ')}`,
      evidenceObservationIds),
    externalPolicyCheck('kc_safety', source.kcSafetyStatus, evidenceObservationIds),
    externalPolicyCheck('ip_licensing', source.ipLicensingStatus, evidenceObservationIds),
    externalPolicyCheck('quality_readiness', source.qualityReadinessStatus, evidenceObservationIds),
    check('observation_window', observationWindowDays !== null && observationWindowDays >= 30
      ? 'pass'
      : evidenceObservationIds.length > 0 ? 'pending' : 'missing',
    observationWindowDays !== null
      ? `${observationWindowDays}일 관측 창입니다.`
      : evidenceObservationIds.length > 0
        ? '관측 창 기준을 아직 계산하지 않았습니다.'
        : '관측 근거가 없습니다.',
    evidenceObservationIds),
  ];

  return {
    recommendationItemId: item.id,
    status: episodeStatus(economics.status, checks, evidenceObservationIds.length > 0),
    policyKey: VALIDATION_POLICY_KEY,
    policyVersion: VALIDATION_POLICY_VERSION,
    evidenceCutoffAt: cutoffAt,
    completedAt: cutoffAt,
    validUntil: dateOrNull(source.validUntil),
    summary: {
      score: item.score,
      landedCostKrw: economics.landedCostKrw,
      expectedMarginBps: economics.expectedMarginBps,
      missingCodes: economics.missingCodes,
      sourcePlatform: item.sourcePlatform,
    },
    checks,
  };
}

function check(
  checkKey: string,
  status: SourcingValidationCheckStatus,
  summary: string,
  evidenceObservationIds: string[],
): SourcingValidationEpisodeWrite['checks'][number] {
  return {
    checkKey,
    status,
    severity: status === 'fail' ? 'blocking' : status === 'missing' ? 'warning' : null,
    score: null,
    summary,
    details: {},
    evidenceObservationIds,
  };
}

function externalPolicyCheck(
  checkKey: 'kc_safety' | 'ip_licensing' | 'quality_readiness',
  rawStatus: unknown,
  evidenceObservationIds: string[],
): SourcingValidationEpisodeWrite['checks'][number] {
  const status = rawStatus === 'pass' || rawStatus === 'fail'
    ? rawStatus
    : rawStatus === 'not_applicable'
      ? rawStatus
      : 'missing';
  return check(
    checkKey,
    status,
    status === 'missing'
      ? '검토 근거가 아직 없습니다.'
      : status === 'pass'
        ? '검토 통과 근거가 있습니다.'
        : status === 'fail'
          ? '검토 실패 근거가 있습니다.'
          : '이 후보에는 적용되지 않습니다.',
    evidenceObservationIds,
  );
}

function episodeStatus(
  economicsStatus: 'blocked' | 'ready_for_review',
  checks: SourcingValidationEpisodeWrite['checks'],
  hasEvidence: boolean,
): SourcingValidationEpisodeStatus {
  if (checks.some((item) => item.status === 'fail')) return 'failed';
  if (economicsStatus === 'blocked') return 'blocked';
  if (checks.every((item) => item.status === 'pass' || item.status === 'not_applicable')) {
    return 'ready_for_review';
  }
  return hasEvidence ? 'observing' : 'pending';
}

function ready(
  run: SourcingRecommendationRunGraph,
  items: SourcingValidationItemRecord[],
  nextCursor: string | null,
): SourcingValidationEnvelope {
  return {
    status: 'ready',
    generatedAt: new Date().toISOString(),
    lastSuccessfulAt: run.completedAt?.toISOString() ?? run.generatedAt.toISOString(),
    freshUntil: run.expiresAt?.toISOString() ?? null,
    operationId: null,
    warnings: [],
    error: null,
    data: {
      recommendationRunId: run.id,
      items: items.map(toPublicView),
      nextCursor,
    },
  };
}

function unavailable(now: Date, code: string): SourcingValidationEnvelope {
  return {
    status: 'unavailable',
    generatedAt: now.toISOString(),
    lastSuccessfulAt: null,
    freshUntil: null,
    operationId: null,
    warnings: [],
    error: {
      code,
      retryable: true,
      message: '검증에 사용할 추천 데이터가 아직 없습니다.',
    },
    data: null,
  };
}

function toPublicView(item: SourcingValidationItemRecord): SourcingValidationItemView {
  const { updatedAt: _updatedAt, ...view } = item;
  return view;
}

function normalizeLimit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

function compactIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function dateOrNull(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
