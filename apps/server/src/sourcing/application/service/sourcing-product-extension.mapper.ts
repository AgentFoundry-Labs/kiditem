import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  SourcingExtensionV1ProductSchema,
  type SourcingExtensionV1Product,
} from '@kiditem/shared/sourcing';
import { parseAllowedSupplierUrl, extractSupplierOfferId } from '../../domain/supplier-source-url-policy';
import { canonicalSourceRecordIdentity } from '../../domain/source-record-identity';
import {
  hashCollectionRequest,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import type {
  AuthorizedCollectionOutput,
  SourcingExtensionSourceRecordProjection,
  SourcingCollectionPermit,
} from '../port/out/repository/sourcing-collection.repository.port';

/** 확장이 현재 탭에서 뽑은 상품 문서(상세 + 선택 설명). 옛 extension-ingest complete 본문과 같다. */
export const ProductExtensionDocumentSchema = z.object({ product: SourcingExtensionV1ProductSchema,
  description: SourcingExtensionV1ProductSchema.optional(), hadDescription: z.boolean() }).strict();

export function productPlan(sourceUrl: string) {
  const supplier = parseSupplierUrl(sourceUrl);
  // Freeze the actual tab, including its search query/fragment. Candidate
  // identity normalization remains in toV1Command, not in the execution plan.
  return { source: `${supplier.platform}.product_extension`, sourceUrl: new URL(sourceUrl).toString(), platform: supplier.platform };
}

export interface ExtensionProductCommand {
  pageType: 'detail' | 'description';
  sourceUrl: string;
  sourcePlatform: '1688' | 'alibaba';
  externalOfferId: string;
  variantKeyNormalized: string;
  title: string | null;
  capturedAt: Date;
  payload: Record<string, unknown>;
}

export function toV1Command(product: SourcingExtensionV1Product): ExtensionProductCommand {
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

export function parseSupplierUrl(value: string) {
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

export function buildExtensionOutput(
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

export function extensionSourceRecordProjection(
  command: ExtensionProductCommand,
  organizationId: string,
  userId: string | null,
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
    organizationId,
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
    triggeredByUserId: userId,
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
