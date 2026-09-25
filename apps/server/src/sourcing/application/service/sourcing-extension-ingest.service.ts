import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  SourcingExtensionV1ProductSchema,
  type SourcingExtensionV1Product,
} from '@kiditem/shared/sourcing';
import { parseAllowedSupplierUrl, extractSupplierOfferId } from '../../domain/supplier-source-url-policy';
import { canonicalSourceRecordIdentity } from '../../domain/source-record-identity';
import { SourceRecordDuplicateError } from '../../domain/source-record-admission';
import { ALREADY_COLLECTED_CODE } from './source-record-refusal';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, type SourcingBrowserSourceAttemptRepositoryPort } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { assertToken, boundedText, requireIdempotencyKey, toPermit } from './sourcing-source-attempt-primitives';
import {
  hashCollectionRequest,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import type {
  AuthorizedCollectionOutput,
  SourcingExtensionSourceRecordProjection,
  SourcingCollectionPermit,
} from '../port/out/repository/sourcing-collection.repository.port';

const EXTENSION_LEASE_MS = 2 * 60_000;

export interface AuthenticatedSourcingContext {
  organizationId: string;
  userId: string | null;
}

const BeginSchema = z.object({ sourceUrl: z.string().min(1).max(2000) }).strict();
const CompleteSchema = z.object({ product: SourcingExtensionV1ProductSchema,
  description: SourcingExtensionV1ProductSchema.optional(), hadDescription: z.boolean() }).strict();

/**
 * Maps the deployed extension wire payload into Sourcing source-record evidence. The source record
 * and its draft are admitted in the attempt's terminal transaction (KID-313).
 */
@Injectable()
export class SourcingExtensionIngestService {
  constructor(
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
  ) {}

  async begin(context: AuthenticatedSourcingContext, raw: unknown, idempotencyKey: string) {
    const parsed = BeginSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('INVALID_PRODUCT_SOURCE_PLAN');
    const plan = productPlan(parsed.data.sourceUrl);
    return (await this.attempts.beginAttempt({ organizationId: context.organizationId,
      sourceKey: plan.source, scopeKey: 'current-tab', targetKey: hashCollectionRequest(parseSupplierUrl(plan.sourceUrl).normalizedUrl),
      idempotencyKey: requireIdempotencyKey(idempotencyKey), requestFingerprint: hashCollectionRequest(plan),
      plan, planChecksum: hashCollectionRequest(plan), requestedByUserId: context.userId,
      collectorKey: 'kiditem-os-product-extension', collectorVersion: 'kiditem-os/v1',
      triggerKind: 'extension', expiresInMs: EXTENSION_LEASE_MS, failureAlert: productAlert(plan.source),
    })).attempt;
  }

  async read(organizationId: string, attemptId: string) {
    const attempt = await this.attempts.readAttempt({ organizationId, attemptId });
    if (!attempt || !['1688.product_extension', 'alibaba.product_extension'].includes(attempt.sourceKey)) {
      throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    }
    return attempt;
  }

  status(organizationId: string, sourceUrl: string) {
    const plan = productPlan(sourceUrl);
    return this.attempts.readSourceStatus({ organizationId, sourceKey: plan.source,
      scopeKey: 'current-tab', targetKey: hashCollectionRequest(parseSupplierUrl(plan.sourceUrl).normalizedUrl), currentPlanChecksum: hashCollectionRequest(plan) });
  }

  async complete(context: AuthenticatedSourcingContext, attemptId: string, attemptToken: string, raw: unknown) {
    const attempt = await this.read(context.organizationId, attemptId);
    assertToken(attempt, attemptToken);
    let outputs: AuthorizedCollectionOutput[];
    let content: unknown;
    try {
      const parsed = CompleteSchema.safeParse(raw);
      if (!parsed.success) throw new BadRequestException('INVALID_PRODUCT_SOURCE_BATCH');
      const { product, description, hadDescription } = parsed.data;
      const plan = productPlan(product.source_url);
      if (hashCollectionRequest(plan) !== attempt.planChecksum || plan.source !== attempt.sourceKey
        || product.source_platform && product.source_platform.toLowerCase() !== plan.platform
        || hadDescription !== Boolean(description) || product.page_type === 'description'
        || description && (product.page_type === 'search' || description.source_url !== product.source_url
          || description.product_id !== product.product_id)) {
        throw new BadRequestException('PRODUCT_SOURCE_PLAN_MISMATCH');
      }
      const commands = product.page_type === 'search' ? [] : [toV1Command(product),
        ...(description ? [toV1Command({ ...description, page_type: 'description' })] : [])];
      const permit = toPermit(attempt, context.organizationId);
      outputs = commands.map((command) => buildExtensionOutput(permit, command, extensionSourceRecordProjection(command, context)));
      content = parsed.data;
    } catch (error) {
      await this.fail(context.organizationId, attemptId, attemptToken, { code: 'INVALID_PRODUCT_SOURCE_BATCH', message: 'The extracted product does not match the complete frozen source plan.' });
      throw error;
    }
    const output: AuthorizedCollectionOutput = {
      observations: outputs.flatMap((output) => output.observations),
      typedRecords: outputs.flatMap((output) => output.typedRecords),
      discoveredCount: outputs.length, rejectedCount: 0,
      qualityReport: { schemaVersion: 'v1', completeSnapshot: true, searchArtifact: outputs.length === 0 },
    };
    try {
      return await this.attempts.completeAttempt({ organizationId: context.organizationId, attemptId, attemptToken,
        planChecksum: attempt.planChecksum, contentChecksum: hashCollectionRequest(content), output,
        sourceWindowStartAt: null, sourceWindowEndAt: new Date() });
    } catch (error) {
      // 이미 수집한 원본이다. 원천 실패가 아니니 알림 없이 이 수집을 멈추고 같은 409 로 답한다(KID-313).
      if (error instanceof SourceRecordDuplicateError) {
        await this.attempts.failAttempt({ organizationId: context.organizationId, attemptId, attemptToken,
          code: ALREADY_COLLECTED_CODE, message: error.message.slice(0, 1000) });
      }
      throw error;
    }
  }

  async fail(organizationId: string, attemptId: string, attemptToken: string, raw: unknown) {
    const attempt = await this.read(organizationId, attemptId);
    const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return this.attempts.failAttempt({ organizationId, attemptId, attemptToken,
      code: boundedText(body.code, 100) || 'SOURCE_COLLECTION_FAILED',
      message: boundedText(body.message, 1000) || 'Product extraction failed.',});
  }
}

function productPlan(sourceUrl: string) {
  const supplier = parseSupplierUrl(sourceUrl);
  // Freeze the actual tab, including its search query/fragment. Candidate
  // identity normalization remains in toV1Command, not in the execution plan.
  return { source: `${supplier.platform}.product_extension`, sourceUrl: new URL(sourceUrl).toString(), platform: supplier.platform };
}

function productAlert(source: string) {
  return { sourceType: source, dedupeKey: `source:${source}`, title: `${source.startsWith('1688') ? '1688' : 'Alibaba'} 상품 수집 실패`, href: '/sourcing-ai' };
}

interface ExtensionProductCommand {
  pageType: 'detail' | 'description';
  sourceUrl: string;
  sourcePlatform: '1688' | 'alibaba';
  externalOfferId: string;
  variantKeyNormalized: string;
  title: string | null;
  capturedAt: Date;
  payload: Record<string, unknown>;
}

function toV1Command(product: SourcingExtensionV1Product): ExtensionProductCommand {
  const pageType = product.page_type ?? 'detail';
  if (pageType === 'search') throw new TypeError('search payload has no durable extension command');
  const supplier = parseSupplierUrl(product.source_url);
  const declaredPlatform = product.source_platform?.trim().toLocaleLowerCase('en-US');
  if (declaredPlatform && declaredPlatform !== supplier.platform) {
    throw new BadRequestException('공급사 URL과 source_platform이 일치하지 않습니다.');
  }
  const sourcePlatform = supplier.platform;
  const externalOfferId = product.product_id?.trim() || extractSupplierOfferId(supplier);
  if (!externalOfferId) throw new BadRequestException('공급사 상품 식별자가 필요합니다.');
  if (pageType === 'detail' && !product.title?.trim()) {
    throw new BadRequestException('상세 수집에는 상품명이 필요합니다.');
  }
  const payload = sanitizeV1(product, supplier.normalizedUrl, sourcePlatform);
  return {
    pageType,
    sourceUrl: supplier.normalizedUrl,
    sourcePlatform,
    externalOfferId,
    variantKeyNormalized: normalizedVariantKey(payload.variant_key),
    title: product.title?.trim() ?? null,
    capturedAt: new Date(),
    payload,
  };
}

function parseSupplierUrl(value: string) {
  try {
    return parseAllowedSupplierUrl(value);
  } catch {
    throw new BadRequestException('지원하지 않는 공급사 상품 URL입니다.');
  }
}

function sanitizeV1(
  product: SourcingExtensionV1Product,
  sourceUrl: string,
  sourcePlatform: '1688' | 'alibaba',
): Record<string, unknown> {
  return omitUndefined({
    page_type: product.page_type ?? 'detail',
    source_url: sourceUrl,
    source_platform: sourcePlatform,
    product_id: product.product_id,
    variant_key: product.variant_key,
    title: product.title,
    description: product.description,
    description_text: product.description_text,
    images: product.images,
    description_images: product.description_images,
    detail_images: product.detail_images,
    category_name: product.category_name,
    tags: product.tags,
    price: product.price,
    price_min: product.price_min,
    price_max: product.price_max,
    priceRange: product.priceRange,
    currency: product.currency,
    moq: product.moq,
    unit: product.unit,
    sales_volume: product.sales_volume,
    supplier_name: product.supplier_name,
    seller_login_id: product.seller_login_id,
    seller_user_id: product.seller_user_id,
    seller_store_url: product.seller_store_url,
    specs: product.specs,
    pack_info: product.pack_info,
    sku_attrs: product.sku_attrs,
    sku_list: product.sku_list,
    price_tiers: product.price_tiers,
    total_found: product.total_found,
  });
}

function buildExtensionOutput(
  permit: SourcingCollectionPermit,
  command: ExtensionProductCommand,
  projection: SourcingExtensionSourceRecordProjection,
): AuthorizedCollectionOutput {
  const rawPayload = {
    externalOfferId: command.externalOfferId,
    variantKey: command.variantKeyNormalized,
    title: command.title,
    sourceUrl: command.sourceUrl,
    commercial: command.payload,
  };
  return {
    observations: [{
      organizationId: permit.organizationId,
      operationId: permit.runId,
      sourceKey: permit.sourceKey,
      platform: command.sourcePlatform,
      evidenceFamily: 'supplier_product_extension',
      signalRole: 'supply',
      granularity: 'supply_catalog',
      conceptKey: command.title ? normalizeCollectionTarget(command.title) : null,
      sourceEntityType: 'supplier_offer',
      sourceEntityId: command.externalOfferId,
      schemaVersion: 'supplier-extension/v1',
      observationKey: hashCollectionRequest({
        attemptId: permit.runId,
        pageType: command.pageType,
        platform: command.sourcePlatform,
        externalOfferId: command.externalOfferId,
        variantKey: command.variantKeyNormalized,
        capturedAt: command.capturedAt,
      }),
      revision: 1,
      supportsCandidate: true,
      sourceUrl: command.sourceUrl,
      eventAt: command.capturedAt,
      observedAt: command.capturedAt,
      availableAt: command.capturedAt,
      revisionAt: null,
      payloadHash: hashCollectionRequest(rawPayload),
      rawPayload,
      ingestedAt: command.capturedAt,
    }],
    typedRecords: [{ kind: 'extension_source_record', row: projection }],
    discoveredCount: 1,
    rejectedCount: 0,
    qualityReport: { schemaVersion: 'v1', externalOfferId: command.externalOfferId },
  };
}

function extensionSourceRecordProjection(
  command: ExtensionProductCommand,
  context: AuthenticatedSourcingContext,
): SourcingExtensionSourceRecordProjection {
  const productImages = command.pageType === 'detail'
    ? stringArray(command.payload.images).map((url, sortOrder) => ({
        url,
        role: 'product',
        label: null,
        sortOrder,
        source: 'sourcing-extension',
        isPrimary: sortOrder === 0,
      }))
    : stringArray(command.payload.description_images)
      .concat(stringArray(command.payload.detail_images))
      .filter((url, index, all) => all.indexOf(url) === index)
      .map((url, sortOrder) => ({
        url,
        role: 'detail',
        label: null,
        sortOrder,
        source: 'sourcing-extension-description',
        isPrimary: false,
      }));
  const price = firstPositiveNumber(
    command.payload.price,
    command.payload.price_min,
    ...priceTierPrices(command.payload.price_tiers),
  );
  return {
    organizationId: context.organizationId,
    pageType: command.pageType,
    sourceUrl: command.sourceUrl,
    sourcePlatform: sourceRecordPlatform(command.sourcePlatform),
    externalOfferId: command.externalOfferId,
    variantKeyNormalized: command.variantKeyNormalized,
    sourceIdentityHash: canonicalSourceRecordIdentity({
      sourcePlatform: sourceRecordPlatform(command.sourcePlatform),
      sourceUrl: command.sourceUrl,
      validatedExternalOfferId: extractSupplierOfferId(parseSupplierUrl(command.sourceUrl)),
      variantKeyNormalized: command.variantKeyNormalized,
    }),
    rawData: command.payload,
    name: command.title,
    description: stringValue(
      command.pageType === 'description'
        ? command.payload.description_text
        : command.payload.description,
    ),
    category: stringValue(command.payload.category_name),
    tags: stringArray(command.payload.tags),
    thumbnailUrl: command.pageType === 'detail' ? productImages[0]?.url ?? null : null,
    imageUrl: command.pageType === 'detail' ? productImages[0]?.url ?? null : null,
    costCny: price,
    triggeredByUserId: context.userId,
    images: productImages,
  };
}

function sourceRecordPlatform(platform: '1688' | 'alibaba'): string {
  return platform === '1688' ? 'ALIBABA_1688' : 'ALIBABA';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function firstPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function priceTierPrices(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((tier) => {
    if (!tier || typeof tier !== 'object') return null;
    const row = tier as Record<string, unknown>;
    return row.price ?? row.unit_price ?? row.unitPriceCny;
  });
}

function normalizedVariantKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
