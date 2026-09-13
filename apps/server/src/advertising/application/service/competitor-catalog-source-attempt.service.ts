import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  AdvertisingCompetitorCatalogBatchSchema,
} from '@kiditem/shared/sourcing';
import { z } from 'zod';
import {
  COMPETITOR_CATALOG_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type CompetitorCatalogAttemptInput,
  type CompetitorCatalogAttemptPlan,
  type CompetitorCatalogSourceAttemptRepositoryPort,
  type CompetitorCatalogSourceView,
  type CompetitorCatalogTargetPlan,
} from '../port/out/repository/competitor-catalog-source-attempt.repository.port';
import { CompetitorTrackingService } from './competitor-tracking.service';

const TARGET_LIMIT = 20;

@Injectable()
export class CompetitorCatalogSourceAttemptService {
  constructor(
    @Inject(COMPETITOR_CATALOG_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: CompetitorCatalogSourceAttemptRepositoryPort,
    private readonly tracking: CompetitorTrackingService,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    input: CompetitorCatalogAttemptInput;
  }): Promise<CompetitorCatalogAttemptPlan> {
    const organizationId = requiredText(input.organizationId, 'INVALID_ORGANIZATION');
    const idempotencyKey = requiredText(input.idempotencyKey, 'INVALID_IDEMPOTENCY_KEY');
    if (idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    }
    const request = normalizeInput(input.input);
    const replay = await this.attempts.replayAttempt({ organizationId, idempotencyKey, input: request });
    if (replay) return replay;
    const selected = await this.tracking.getSellerTargets(organizationId, 30, TARGET_LIMIT);
    const targets = selectTargets(selected.targets, request);
    return this.attempts.beginAttempt({
      organizationId,
      idempotencyKey,
      input: request,
      targets,
    });
  }

  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<CompetitorCatalogAttemptPlan | null> {
    return this.attempts.readAttemptControl({
      organizationId: requiredText(input.organizationId, 'INVALID_ORGANIZATION'),
      attemptId: requiredText(input.attemptId, 'INVALID_COMPETITOR_CATALOG_ATTEMPT'),
    });
  }

  readSourceStatus(organizationId: string): Promise<CompetitorCatalogSourceView> {
    return this.attempts.readSourceStatus({
      organizationId: requiredText(organizationId, 'INVALID_ORGANIZATION'),
    });
  }

  submitAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    catalogs: readonly unknown[];
  }): Promise<CompetitorCatalogSourceView> {
    const batch = AdvertisingCompetitorCatalogBatchSchema.safeParse({
      catalogs: input.catalogs,
    });
    if (!batch.success) {
      throw new BadRequestException('INVALID_COMPETITOR_CATALOG_BATCH');
    }
    return this.attempts.submitAttempt({
      organizationId: requiredText(input.organizationId, 'INVALID_ORGANIZATION'),
      attemptId: requiredText(input.attemptId, 'INVALID_COMPETITOR_CATALOG_ATTEMPT'),
      attemptToken: requiredText(input.attemptToken, 'INVALID_SOURCE_ATTEMPT_TOKEN'),
      catalogs: batch.data.catalogs,
    });
  }

  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<CompetitorCatalogSourceView> {
    const code = requiredText(input.code, 'INVALID_COMPETITOR_CATALOG_FAILURE');
    const message = requiredText(input.message, 'INVALID_COMPETITOR_CATALOG_FAILURE');
    if (code.length > 100 || message.length > 300) {
      throw new BadRequestException('INVALID_COMPETITOR_CATALOG_FAILURE');
    }
    return this.attempts.failAttempt({
      organizationId: requiredText(input.organizationId, 'INVALID_ORGANIZATION'),
      attemptId: requiredText(input.attemptId, 'INVALID_COMPETITOR_CATALOG_ATTEMPT'),
      attemptToken: requiredText(input.attemptToken, 'INVALID_SOURCE_ATTEMPT_TOKEN'),
      code,
      message,
    });
  }
}

function normalizeInput(value: CompetitorCatalogAttemptInput): CompetitorCatalogAttemptInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_COMPETITOR_CATALOG_SCOPE');
  }
  if (value.target === 'all') return { target: 'all' };
  if (value.target === 'rank_enrichment') {
    if (value.excludeCompletedAttemptId === undefined) return { target: 'rank_enrichment' };
    const reference = z.string().uuid().safeParse(value.excludeCompletedAttemptId);
    if (!reference.success) throw new BadRequestException('INVALID_COMPETITOR_CATALOG_SCOPE');
    return { target: 'rank_enrichment', excludeCompletedAttemptId: reference.data };
  }
  if (value.target === 'seller_id') {
    const sellerId = requiredText(value.sellerId, 'INVALID_COMPETITOR_SELLER_ID');
    if (!/^[A-Za-z0-9_-]+$/u.test(sellerId) || sellerId.length > 80) {
      throw new BadRequestException('INVALID_COMPETITOR_SELLER_ID');
    }
    return { target: 'seller_id', sellerId };
  }
  throw new BadRequestException('INVALID_COMPETITOR_CATALOG_SCOPE');
}

function selectTargets(
  values: readonly unknown[],
  input: CompetitorCatalogAttemptInput,
): CompetitorCatalogTargetPlan[] {
  if (!Array.isArray(values) || values.length > TARGET_LIMIT) {
    throw new BadRequestException('COMPETITOR_CATALOG_TARGET_PLAN_INVALID');
  }
  const targets = values.map(normalizeTarget);
  if (targets.some((target) => target === null)) {
    throw new BadRequestException('COMPETITOR_CATALOG_TARGET_PLAN_INVALID');
  }
  const completeTargets = targets as CompetitorCatalogTargetPlan[];
  if (new Set(completeTargets.map((target) => target.sellerId)).size !== completeTargets.length) {
    throw new BadRequestException('COMPETITOR_CATALOG_TARGET_PLAN_INVALID');
  }
  const selected = input.target === 'seller_id'
    ? completeTargets.filter((target) => target.sellerId === input.sellerId)
    : completeTargets;
  if (input.target === 'seller_id' && selected.length !== 1) {
    throw new BadRequestException('COMPETITOR_CATALOG_TARGET_NOT_CONFIGURED');
  }
  return selected;
}

function normalizeTarget(value: unknown): CompetitorCatalogTargetPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const sellerId = optionalText(row.sellerId);
  const sellerName = optionalText(row.sellerName);
  const sellerStoreUrl = optionalText(row.sellerStoreUrl);
  const keyword = optionalText(row.keyword);
  if (!sellerId || !sellerName || !sellerStoreUrl || !keyword) return null;
  if (!/^[A-Za-z0-9_-]+$/u.test(sellerId) || sellerId.length > 80) return null;
  if (sellerName.length > 300 || keyword.length > 100 || sellerStoreUrl.length > 2_000) return null;
  try {
    const url = new URL(sellerStoreUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'shop.coupang.com') return null;
  } catch {
    return null;
  }
  return { sellerId, sellerName, sellerStoreUrl, keyword };
}

function requiredText(value: unknown, code: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new BadRequestException(code);
  return normalized;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/gu, ' ').normalize('NFC');
  return normalized.length > 0 ? normalized : null;
}
