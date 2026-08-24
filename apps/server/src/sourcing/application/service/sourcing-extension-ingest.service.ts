import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  SourcingExtensionV1ProductSchema,
  SourcingExtensionV2ProductSchema,
  type SourcingExtensionV1Product,
} from '@kiditem/shared/sourcing';
import type {
  AuthorizedCollectionOutput,
  SourcingExtensionCandidateProjection,
  SourcingCollectionPermit,
} from '../port/out/repository/sourcing-collection.repository.port';
import { parseAllowedSupplierUrl, extractSupplierOfferId } from '../../domain/supplier-source-url-policy';
import { canonicalSourcingCandidateIdentity } from '../../domain/sourcing-candidate-identity';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';
import {
  hashCollectionRequest,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';

const EXTENSION_LEASE_MS = 2 * 60_000;

export interface AuthenticatedSourcingContext {
  organizationId: string;
  userId: string | null;
}

export interface ExtensionV1Response {
  ok: true;
  message: string;
  product_count: number;
}

export interface CreateExtensionV2CollectionSessionInput {
  sourcePlatform: '1688' | 'alibaba';
  sourceUrl: string;
  externalOfferId: string;
  variantKey: string;
}

/**
 * Owns the compatibility translation for browser extension product payloads.
 * The legacy controller path remains stable, while every durable write is
 * preceded by the same allowed-source/lease gate used by provider collectors.
 */
@Injectable()
export class SourcingExtensionIngestService {
  constructor(
    private readonly collections: SourcingCollectionCoordinator,
  ) {}

  async ingestV1(
    context: AuthenticatedSourcingContext,
    raw: unknown,
  ): Promise<ExtensionV1Response> {
    const product = parseV1(raw);
    if ((product.page_type ?? 'detail') === 'search') {
      return {
        ok: true,
        message: `received search data from ${product.source_platform ?? 'supplier'}`,
        product_count: product.total_found ?? 0,
      };
    }
    const command = toV1Command(product);
    return this.commitAndPersist(context, command, 'v1');
  }

  async ingestV2(
    context: AuthenticatedSourcingContext,
    raw: unknown,
  ): Promise<ExtensionV1Response> {
    const parsed = SourcingExtensionV2ProductSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('v2 확장 수집 payload 형식이 올바르지 않습니다.');
    const product = parsed.data;
    const supplier = parseSupplierUrl(product.sourceUrl);
    if (supplier.platform !== product.sourcePlatform) {
      throw new BadRequestException('공급사 URL과 sourcePlatform이 일치하지 않습니다.');
    }
    const command: ExtensionProductCommand = {
      pageType: 'detail',
      sourceUrl: supplier.normalizedUrl,
      sourcePlatform: product.sourcePlatform,
      externalOfferId: product.externalOfferId.trim(),
      variantKeyNormalized: normalizedVariantKey(product.variantKey),
      title: product.title.trim(),
      capturedAt: new Date(product.capturedAt),
      payload: {
        page_type: 'detail',
        source_url: supplier.normalizedUrl,
        source_platform: product.sourcePlatform,
        product_id: product.externalOfferId.trim(),
        title: product.title.trim(),
        price_min: product.priceMin ?? undefined,
        price_max: product.priceMax ?? undefined,
        moq: product.minOrderQuantity ?? undefined,
        supplier_name: product.supplierName ?? undefined,
        sku_attrs: product.skuAttributes,
        sku_list: product.skuItems,
        price_tiers: product.priceTiers.map((tier) => ({
          beginAmount: tier.minQuantity,
          price: tier.unitPriceCny,
        })),
      },
      requestHash: extensionSessionRequestHash({
        collectionSessionId: product.collectionSessionId,
        sourcePlatform: supplier.platform,
        sourceUrl: supplier.normalizedUrl,
        externalOfferId: product.externalOfferId.trim(),
        variantKey: product.variantKey,
      }),
      idempotencyKey: `extension:v2:${product.collectionSessionId}`,
      collectorVersion: product.extractorVersion,
    };
    return this.commitAndPersist(context, command, 'v2');
  }

  async issueV2CollectionSession(
    context: AuthenticatedSourcingContext,
    input: CreateExtensionV2CollectionSessionInput,
  ): Promise<{ collectionSessionId: string; expiresAt: string }> {
    const supplier = parseSupplierUrl(input.sourceUrl);
    if (supplier.platform !== input.sourcePlatform) {
      throw new BadRequestException('공급사 URL과 sourcePlatform이 일치하지 않습니다.');
    }
    const externalOfferId = input.externalOfferId.trim();
    if (!externalOfferId) throw new BadRequestException('공급사 상품 식별자가 필요합니다.');
    const collectionSessionId = randomUUID();
    const variantKeyNormalized = normalizedVariantKey(input.variantKey);
    const requestHash = extensionSessionRequestHash({
      collectionSessionId,
      sourcePlatform: supplier.platform,
      sourceUrl: supplier.normalizedUrl,
      externalOfferId,
      variantKey: variantKeyNormalized,
    });
    const permit = await this.collections.issuePermit({
      organizationId: context.organizationId,
      sourceKey: `${supplier.platform}.product_extension`,
      scopeKey: 'detail',
      targetKey: `${externalOfferId}:${variantKeyNormalized}`,
      idempotencyKey: `extension:v2:${collectionSessionId}`,
      requestHash,
      collectorKey: 'kiditem-os-product-extension',
      collectorVersion: 'kiditem-os/v2',
      triggerKind: 'extension',
      triggeredByUserId: context.userId,
      leaseDurationMs: EXTENSION_LEASE_MS,
    });
    return {
      collectionSessionId,
      expiresAt: permit.leaseExpiresAt.toISOString(),
    };
  }

  private async commitAndPersist(
    context: AuthenticatedSourcingContext,
    command: ExtensionProductCommand,
    schemaVersion: 'v1' | 'v2',
  ): Promise<ExtensionV1Response> {
    const sourceKey = `${command.sourcePlatform}.product_extension`;
    const result = await this.collections.execute({
      organizationId: context.organizationId,
      sourceKey,
      scopeKey: command.pageType,
      targetKey: `${command.externalOfferId}:${command.variantKeyNormalized}`,
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      collectorKey: 'kiditem-os-product-extension',
      collectorVersion: command.collectorVersion,
      triggerKind: 'extension',
      triggeredByUserId: context.userId,
      leaseDurationMs: EXTENSION_LEASE_MS,
      requireExistingPermit: schemaVersion === 'v2',
    }, async ({ permit }) => buildExtensionOutput(
      permit,
      command,
      schemaVersion,
      extensionCandidateProjection(command, context),
    ));

    if (result.kind === 'existing') {
      return { ok: true, message: 'already collected', product_count: 0 };
    }

    return {
      ok: true,
      message: 'collected',
      product_count: 1,
    };
  }
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
  requestHash: string;
  idempotencyKey: string;
  collectorVersion: string;
}

function parseV1(raw: unknown): SourcingExtensionV1Product {
  const parsed = SourcingExtensionV1ProductSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestException('확장 수집 payload 형식이 올바르지 않습니다.');
  return parsed.data;
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
  const requestHash = hashCollectionRequest(payload);
  return {
    pageType,
    sourceUrl: supplier.normalizedUrl,
    sourcePlatform,
    externalOfferId,
    variantKeyNormalized: normalizedVariantKey(payload.variant_key),
    title: product.title?.trim() ?? null,
    capturedAt: new Date(),
    payload,
    requestHash,
    idempotencyKey: `extension:v1:${requestHash}`,
    collectorVersion: 'kiditem-os/v1',
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
  schemaVersion: 'v1' | 'v2',
  projection: SourcingExtensionCandidateProjection,
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
      ingestionRunId: permit.runId,
      sourceKey: permit.sourceKey,
      platform: command.sourcePlatform,
      evidenceFamily: 'supplier_product_extension',
      signalRole: 'supply',
      granularity: 'supply_catalog',
      conceptKey: command.title ? normalizeCollectionTarget(command.title) : null,
      sourceEntityType: 'supplier_offer',
      sourceEntityId: command.externalOfferId,
      schemaVersion: `supplier-extension/${schemaVersion}`,
      observationKey: hashCollectionRequest({
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
    typedRecords: [{ kind: 'extension_candidate', row: projection }],
    discoveredCount: 1,
    rejectedCount: 0,
    qualityReport: { schemaVersion, externalOfferId: command.externalOfferId },
  };
}

function extensionCandidateProjection(
  command: ExtensionProductCommand,
  context: AuthenticatedSourcingContext,
): SourcingExtensionCandidateProjection {
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
    sourcePlatform: candidatePlatform(command.sourcePlatform),
    externalOfferId: command.externalOfferId,
    variantKeyNormalized: command.variantKeyNormalized,
    sourceIdentityHash: canonicalSourcingCandidateIdentity({
      sourcePlatform: candidatePlatform(command.sourcePlatform),
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

function candidatePlatform(platform: '1688' | 'alibaba'): string {
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

function extensionSessionRequestHash(input: {
  collectionSessionId: string;
  sourcePlatform: string;
  sourceUrl: string;
  externalOfferId: string;
  variantKey: string;
}): string {
  return hashCollectionRequest({
    collectionSessionId: input.collectionSessionId,
    sourcePlatform: input.sourcePlatform,
    sourceUrl: input.sourceUrl,
    externalOfferId: input.externalOfferId,
    variantKey: normalizedVariantKey(input.variantKey),
  });
}
