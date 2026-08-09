import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  SOURCING_WORKSPACE_SNAPSHOT_SCOPES,
  type SourcingWorkspaceSnapshotRepositoryPort,
  type SourcingWorkspaceSnapshotRow,
  type SourcingWorkspaceSnapshotScope,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';

const MAX_SNAPSHOT_PAYLOAD_BYTES = 2_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_1688_NEW_PRODUCT_LIMIT = 240;

export interface Append1688NewProductItemsInput {
  source: string;
  keyword?: string;
  category?: string;
  items: Record<string, unknown>[];
  limit?: number;
}

@Injectable()
export class SourcingWorkspaceSnapshotService {
  constructor(
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
  ) {}

  async getToday(organizationId: string, rawScope: string): Promise<SourcingWorkspaceSnapshotRow | null> {
    const scope = parseSnapshotScope(rawScope);
    return this.snapshots.find({
      organizationId,
      scope,
      businessDate: kstBusinessDate(new Date()),
    });
  }

  async getRecent(
    organizationId: string,
    rawScope: string,
    days = 3,
  ): Promise<SourcingWorkspaceSnapshotRow[]> {
    const scope = parseSnapshotScope(rawScope);
    const normalizedDays = Math.max(1, Math.min(30, Math.floor(days)));
    const toBusinessDate = kstBusinessDate(new Date());
    const fromBusinessDate = new Date(toBusinessDate.getTime() - (normalizedDays - 1) * ONE_DAY_MS);
    return this.snapshots.listRecent({
      organizationId,
      scope,
      fromBusinessDate,
      toBusinessDate,
      limit: normalizedDays,
    });
  }

  async saveToday(
    organizationId: string,
    rawScope: string,
    payload: Record<string, unknown>,
  ): Promise<SourcingWorkspaceSnapshotRow> {
    const scope = parseSnapshotScope(rawScope);
    const validatedPayload = validateSourcingWorkspaceSnapshotPayload(scope, payload);
    return this.snapshots.upsert({
      organizationId,
      scope,
      businessDate: kstBusinessDate(new Date()),
      payload: validatedPayload,
    });
  }

  async append1688NewProductItems(
    organizationId: string,
    input: Append1688NewProductItemsInput,
  ): Promise<SourcingWorkspaceSnapshotRow> {
    const source = normalizeRequiredText(input.source, 'source', 80);
    const keyword = normalizeOptionalText(input.keyword, 'keyword', 120);
    const category = normalizeOptionalText(input.category, 'category', 120);
    const limit = input.limit ?? DEFAULT_1688_NEW_PRODUCT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException('limit 범위가 올바르지 않습니다.');
    }
    if (input.items.length === 0 || input.items.length > 500) {
      throw new BadRequestException('items는 1개 이상 500개 이하여야 합니다.');
    }

    const items = input.items.map((item, index) => validate1688NewProductItem(item, index));
    return this.snapshots.append1688Items({
      organizationId,
      businessDate: kstBusinessDate(new Date()),
      source,
      keyword,
      category,
      items,
      limit,
      generatedAt: new Date(),
    });
  }
}

function parseSnapshotScope(scope: string): SourcingWorkspaceSnapshotScope {
  if (SOURCING_WORKSPACE_SNAPSHOT_SCOPES.includes(scope as SourcingWorkspaceSnapshotScope)) {
    return scope as SourcingWorkspaceSnapshotScope;
  }
  throw new BadRequestException('지원하지 않는 소싱 작업 스냅샷 종류입니다.');
}

function validateSourcingWorkspaceSnapshotPayload(
  scope: SourcingWorkspaceSnapshotScope,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  assertPayloadSize(payload);
  assertVersion(payload);
  const input = requireRecord(payload.input, 'input');
  const result = requireRecord(payload.result, 'result');
  const meta = requireRecord(payload.meta, 'meta');
  assertSnapshotMeta(meta);

  if (scope === 'today_recommendations') {
    assertTodayRecommendationsPayload(input, result);
    return payload;
  }

  if (scope === 'interest_tracking') {
    assertInterestTrackingPayload(input, result);
    return payload;
  }

  if (scope === 'sourcing_agent_rag') {
    assertSourcingAgentRagPayload(input, result);
    return payload;
  }

  if (scope === 'sourcing_market_model') {
    assertSourcingMarketModelPayload(input, result);
    return payload;
  }

  if (scope === '1688_new_products') {
    assert1688NewProductsPayload(input, result);
    return payload;
  }

  if (scope === 'sourcing_1688_new_product_model') {
    assertSourcing1688NewProductModelPayload(input, result);
    return payload;
  }

  if (scope === 'market_shadow_signals') {
    assertMarketShadowSignalsPayload(input, result);
    return payload;
  }

  assertKeywordAnalysisPayload(input, result);
  return payload;
}

function assertPayloadSize(payload: Record<string, unknown>) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_SNAPSHOT_PAYLOAD_BYTES) {
    throw new BadRequestException('소싱 작업 스냅샷 payload가 너무 큽니다.');
  }
}

function assertVersion(payload: Record<string, unknown>) {
  if (payload.version !== 1) {
    throw new BadRequestException('지원하지 않는 소싱 작업 스냅샷 버전입니다.');
  }
}

function assertSnapshotMeta(meta: Record<string, unknown>) {
  assertIsoDateString(meta.generatedAt, 'meta.generatedAt');
  if (
    meta.generationSource !== 'manual' &&
    meta.generationSource !== 'scheduled' &&
    meta.generationSource !== 'imported'
  ) {
    throw new BadRequestException('소싱 작업 스냅샷 생성 출처가 올바르지 않습니다.');
  }
  assertString(meta.generatorVersion, 'meta.generatorVersion', 120);
  if (meta.generatedByUserId !== undefined) {
    assertString(meta.generatedByUserId, 'meta.generatedByUserId', 80);
  }
}

function assertTodayRecommendationsPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  assertString(input.keywordText, 'input.keywordText', 10_000);
  assertIntegerInRange(input.keywordLimit, 'input.keywordLimit', 1, 50);
  assertIntegerInRange(input.maxPages, 'input.maxPages', 1, 2);
  assertArray(result.rows, 'result.rows', 100);
  assertArray(result.productSnapshots, 'result.productSnapshots', 2_000);
}

function assertKeywordAnalysisPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  const filters = requireRecord(input.filters, 'input.filters');
  assertIn(filters.timeUnit, 'input.filters.timeUnit', ['date', 'week', 'month']);
  assertIn(filters.gender, 'input.filters.gender', ['all', 'm', 'f']);
  assertString(filters.age, 'input.filters.age', 20);
  assertIn(filters.device, 'input.filters.device', ['all', 'pc', 'mo']);
  assertString(filters.selectedBoardKey, 'input.filters.selectedBoardKey', 80);
  assertString(filters.rankLimit, 'input.filters.rankLimit', 10);
  assertString(filters.focusMode, 'input.filters.focusMode', 80);
  assertString(input.keywordQuery, 'input.keywordQuery', 120);
  assertString(input.trendText, 'input.trendText', 1_000);

  assertArray(result.boards, 'result.boards', 20);
  assertArray(result.trendItems, 'result.trendItems', 50);
  if (result.relatedSearchSeed !== null) {
    assertString(result.relatedSearchSeed, 'result.relatedSearchSeed', 80);
  }
  assertArray(result.searchAdRelatedItems, 'result.searchAdRelatedItems', 100);
  assertArray(result.relatedSearchItems, 'result.relatedSearchItems', 100);
  assertArray(result.autocompleteItems, 'result.autocompleteItems', 100);
  assertArray(result.coupangKeywordItems, 'result.coupangKeywordItems', 100);
  assertArray(result.coupangProductNameTokens, 'result.coupangProductNameTokens', 200);
  if (result.trendAgentResult !== null && !isRecord(result.trendAgentResult)) {
    throw new BadRequestException('result.trendAgentResult 형식이 올바르지 않습니다.');
  }
}

function assertInterestTrackingPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  assertIntegerInRange(input.trackingWindowDays, 'input.trackingWindowDays', 1, 30);
  assertArray(result.targets, 'result.targets', 500);
  assertArray(result.observations, 'result.observations', 5_000);
}

function assertSourcingAgentRagPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  assertIntegerInRange(input.days, 'input.days', 1, 30);
  assertArray(input.sourceScopes, 'input.sourceScopes', 4);
  assertIntegerInRange(input.documentLimit, 'input.documentLimit', 0, 800);
  assertArray(result.documents, 'result.documents', 800);
  requireRecord(result.stats, 'result.stats');
}

function assertSourcingMarketModelPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  assertIntegerInRange(input.days, 'input.days', 1, 30);
  assertArray(input.sourceScopes, 'input.sourceScopes', 4);
  assertIntegerInRange(input.candidateLimit, 'input.candidateLimit', 1, 240);
  assertArray(result.candidates, 'result.candidates', 240);
  requireRecord(result.stats, 'result.stats');
  requireRecord(result.model, 'result.model');
}

function assert1688NewProductsPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  assertString(input.source, 'input.source', 80);
  if (input.keyword !== undefined) assertString(input.keyword, 'input.keyword', 120);
  if (input.category !== undefined) assertString(input.category, 'input.category', 120);
  const items = result.items;
  assertArray(items, 'result.items', 500);
  if (items.length === 0) {
    throw new BadRequestException('result.items는 1개 이상이어야 합니다.');
  }
  items.forEach((item, index) => validate1688NewProductItem(item, index));
}

function validate1688NewProductItem(value: unknown, index: number): Record<string, unknown> {
  const item = requireRecord(value, `result.items[${index}]`);
  const offerId = normalizeOptionalText(item.offerId, `result.items[${index}].offerId`, 160);
  const sourceUrl = normalizeOptionalText(item.sourceUrl, `result.items[${index}].sourceUrl`, 2_000);
  if (!offerId && !sourceUrl) {
    throw new BadRequestException(`result.items[${index}]에는 offerId 또는 sourceUrl이 필요합니다.`);
  }
  normalizeRequiredText(item.title, `result.items[${index}].title`, 1_000);
  if (item.priceCny !== undefined && (!isFiniteNonNegativeNumber(item.priceCny))) {
    throw new BadRequestException(`result.items[${index}].priceCny 숫자 범위가 올바르지 않습니다.`);
  }
  return item;
}

function assertSourcing1688NewProductModelPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  assertIntegerInRange(input.days, 'input.days', 1, 30);
  assertArray(input.sourceScopes, 'input.sourceScopes', 5);
  assertIntegerInRange(input.candidateLimit, 'input.candidateLimit', 1, 240);
  assertArray(result.candidates, 'result.candidates', 240);
  requireRecord(result.stats, 'result.stats');
  requireRecord(result.model, 'result.model');
}

function assertMarketShadowSignalsPayload(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  assertIn(input.experiment, 'input.experiment', ['paired-shadow-v1']);
  assertArray(input.sources, 'input.sources', 5);
  assertArray(input.seedKeywords, 'input.seedKeywords', 200);
  assertIntegerInRange(input.windowDays, 'input.windowDays', 1, 30);
  assertIn(result.status, 'result.status', [
    'collecting',
    'complete',
    'partial',
    'failed',
  ]);
  assertIn(result.decisionImpact, 'result.decisionImpact', ['disabled']);
  assertArray(result.sources, 'result.sources', 5);
  requireRecord(result.evaluation, 'result.evaluation');
  assertArray(result.errors, 'result.errors', 20);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException(`${path} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertArray(value: unknown, path: string, maxLength: number): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${path} 배열이 필요합니다.`);
  }
  if (value.length > maxLength) {
    throw new BadRequestException(`${path} 항목이 너무 많습니다.`);
  }
}

function assertString(value: unknown, path: string, maxLength: number) {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new BadRequestException(`${path} 문자열이 올바르지 않습니다.`);
  }
}

function normalizeRequiredText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new BadRequestException(`${path} 문자열이 올바르지 않습니다.`);
  }
  return value.trim();
}

function normalizeOptionalText(value: unknown, path: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeRequiredText(value, path, maxLength);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function assertIsoDateString(value: unknown, path: string) {
  if (typeof value !== 'string' || value.length > 80) {
    throw new BadRequestException(`${path} 문자열이 올바르지 않습니다.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new BadRequestException(`${path} 날짜가 올바르지 않습니다.`);
  }
}

function assertIntegerInRange(value: unknown, path: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestException(`${path} 숫자 범위가 올바르지 않습니다.`);
  }
}

function assertIn(value: unknown, path: string, allowed: readonly string[]) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new BadRequestException(`${path} 값이 올바르지 않습니다.`);
  }
}
