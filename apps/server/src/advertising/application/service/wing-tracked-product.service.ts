import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WING_TRACKED_PRODUCT_REPOSITORY_PORT,
  type WingTrackedProductAttemptPlan,
  type WingTrackedProductAttemptUpload,
  type WingTrackedProductRepositoryPort,
  type WingTrackedProductSourceView,
  type WingTrackedHistory,
  type WingTrackedProductWithLatest,
  type WingTrackedSnapshotRow,
  type WingTrackedSnapshotValues,
} from '../port/out/repository/wing-tracked-product.repository.port';
import {
  WING_TRACKED_PRODUCT_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type WingTrackedProductSourceAttemptRepositoryPort,
} from '../port/out/repository/wing-tracked-product-source-attempt.repository.port';

/** 컨트롤러가 지표 매핑에 쓰는 스냅샷 값 타입. */
export type WingTrackedSnapshotValuesInput = WingTrackedSnapshotValues;

export interface AddWingTrackedProductInput extends WingTrackedSnapshotValues {
  productId: string;
  itemId?: string | null;
  vendorItemId?: string | null;
  productName: string;
  imagePath?: string | null;
  brandName?: string | null;
  categoryHierarchy?: string | null;
  sourceKeyword?: string | null;
}

export interface IngestWingSnapshotItem extends WingTrackedSnapshotValues {
  productId: string;
  sourceKeyword?: string | null;
}

export interface BeginWingTrackedProductAttemptInput {
  organizationId: string;
  idempotencyKey: string;
  keywords: readonly string[];
}

export interface SubmitWingTrackedProductAttemptInput {
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  items: readonly IngestWingSnapshotItem[];
}

@Injectable()
export class WingTrackedProductService {
  constructor(
    @Inject(WING_TRACKED_PRODUCT_REPOSITORY_PORT)
    private readonly repo: WingTrackedProductRepositoryPort,
    @Inject(WING_TRACKED_PRODUCT_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: WingTrackedProductSourceAttemptRepositoryPort,
  ) {}

  list(organizationId: string): Promise<WingTrackedProductWithLatest[]> {
    return this.repo.list(organizationId);
  }

  /** 추적 등록 + 등록 시점 지표를 오늘 스냅샷으로 저장. */
  async addTracker(
    input: AddWingTrackedProductInput,
    organizationId: string,
  ): Promise<WingTrackedProductWithLatest> {
    const tracker = await this.repo.registerWithInitialSnapshot(input, organizationId);
    const rows = await this.repo.list(organizationId);
    return rows.find((row) => row.id === tracker.id) ?? { ...tracker, latestSnapshot: null };
  }

  async beginAttempt(
    input: BeginWingTrackedProductAttemptInput,
  ): Promise<WingTrackedProductAttemptPlan> {
    const organizationId = requiredText(input.organizationId, 'INVALID_ORGANIZATION');
    const idempotencyKey = requiredText(input.idempotencyKey, 'INVALID_IDEMPOTENCY_KEY');
    if (idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    }
    const keywords = normalizeKeywords(input.keywords);
    if (keywords.length === 0 || keywords.length > 12) {
      throw new BadRequestException('INVALID_WING_TRACKED_KEYWORDS');
    }
    return this.attempts.beginAttempt({ organizationId, idempotencyKey, keywords });
  }

  async readSourceStatus(organizationId: string): Promise<WingTrackedProductSourceView> {
    return this.attempts.readSourceStatus({
      organizationId: requiredText(organizationId, 'INVALID_ORGANIZATION'),
    });
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingTrackedProductAttemptPlan | null> {
    return this.attempts.readAttemptControl({
      organizationId: requiredText(input.organizationId, 'INVALID_ORGANIZATION'),
      attemptId: requiredText(input.attemptId, 'INVALID_ATTEMPT_ID'),
    });
  }

  async submitAttempt(
    input: SubmitWingTrackedProductAttemptInput,
  ): Promise<WingTrackedProductSourceView> {
    const organizationId = requiredText(input.organizationId, 'INVALID_ORGANIZATION');
    const attemptId = requiredText(input.attemptId, 'INVALID_ATTEMPT_ID');
    const attemptToken = requiredText(input.attemptToken, 'INVALID_ATTEMPT_TOKEN');
    if (!Array.isArray(input.items)) {
      throw new BadRequestException('INVALID_WING_TRACKED_SNAPSHOT');
    }
    const items = input.items.map(normalizeAttemptItem);
    return this.attempts.submitAttempt({
      organizationId,
      attemptId,
      attemptToken,
      items,
    });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<WingTrackedProductSourceView> {
    const code = requiredText(input.code, 'INVALID_FAILURE_CODE');
    const message = requiredText(input.message, 'INVALID_FAILURE_MESSAGE');
    if (code.length > 100 || message.length > 300) {
      throw new BadRequestException('INVALID_WING_TRACKED_FAILURE');
    }
    return this.attempts.failAttempt({
      organizationId: requiredText(input.organizationId, 'INVALID_ORGANIZATION'),
      attemptId: requiredText(input.attemptId, 'INVALID_ATTEMPT_ID'),
      attemptToken: requiredText(input.attemptToken, 'INVALID_ATTEMPT_TOKEN'),
      code,
      message,
    });
  }

  async remove(id: string, organizationId: string): Promise<{ id: string }> {
    const removed = await this.repo.delete(id, organizationId);
    return { id: removed.id };
  }

  async getHistory(
    id: string,
    days: number,
    organizationId: string,
  ): Promise<{ trackedProductId: string; productName: string; points: WingTrackedSnapshotRow[] }> {
    const tracker = await this.repo.findById(id, organizationId);
    if (!tracker) throw new NotFoundException('Wing tracked product not found');
    const points = await this.repo.findHistory(id, organizationId, days);
    return { trackedProductId: id, productName: tracker.productName, points };
  }

  async getBulkHistory(
    days: number,
    organizationId: string,
  ): Promise<{ items: WingTrackedHistory[] }> {
    const items = await this.repo.findBulkHistory(organizationId, days);
    return { items };
  }
}

function snapshotValues(input: WingTrackedSnapshotValues): WingTrackedSnapshotValues {
  return {
    salePriceKrw: input.salePriceKrw,
    ratingCount: input.ratingCount,
    ratingAverage: input.ratingAverage,
    pvLast28Day: input.pvLast28Day,
    salesLast28d: input.salesLast28d,
    estimatedRevenue28d: input.estimatedRevenue28d,
    conversionRate28d: input.conversionRate28d,
  };
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new BadRequestException(code);
  const normalized = value.trim();
  if (normalized.length === 0) throw new BadRequestException(code);
  return normalized;
}

function normalizeKeywords(value: readonly string[]): string[] {
  if (!Array.isArray(value)) throw new BadRequestException('INVALID_WING_TRACKED_KEYWORDS');
  const unique = new Map<string, string>();
  for (const keyword of value) {
    const normalized = requiredText(keyword, 'INVALID_WING_TRACKED_KEYWORDS')
      .replace(/\s+/gu, ' ')
      .normalize('NFC');
    if (normalized.length > 100) {
      throw new BadRequestException('INVALID_WING_TRACKED_KEYWORDS');
    }
    const identity = normalized.toLocaleLowerCase('en-US');
    if (!unique.has(identity)) unique.set(identity, normalized);
  }
  return [...unique.values()];
}

function normalizeAttemptItem(
  input: IngestWingSnapshotItem,
): WingTrackedProductAttemptUpload['items'][number] {
  const productId = requiredText(input.productId, 'INVALID_WING_TRACKED_PRODUCT_ID');
  if (productId.length > 40) throw new BadRequestException('INVALID_WING_TRACKED_PRODUCT_ID');
  const sourceKeyword = input.sourceKeyword == null
    ? null
    : requiredText(input.sourceKeyword, 'INVALID_WING_TRACKED_KEYWORD')
      .replace(/\s+/gu, ' ')
      .normalize('NFC');
  const values = snapshotValues(input);
  assertMetric(values.salePriceKrw, 'INVALID_WING_TRACKED_SALE_PRICE');
  assertMetric(values.ratingCount, 'INVALID_WING_TRACKED_RATING_COUNT');
  assertMetric(values.pvLast28Day, 'INVALID_WING_TRACKED_PAGE_VIEWS');
  assertMetric(values.salesLast28d, 'INVALID_WING_TRACKED_SALES');
  assertMetric(values.estimatedRevenue28d, 'INVALID_WING_TRACKED_REVENUE');
  assertDecimal(values.ratingAverage, 5, 'INVALID_WING_TRACKED_RATING');
  assertDecimal(values.conversionRate28d, 1, 'INVALID_WING_TRACKED_CONVERSION');
  return { productId, sourceKeyword, ...values };
}

function assertMetric(value: number | null, code: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new BadRequestException(code);
  }
}

function assertDecimal(value: number | null, max: number, code: string): void {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) {
    throw new BadRequestException(code);
  }
}
