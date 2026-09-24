import { collectedDraftHref } from '../../domain/collected-draft-href';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  SOURCE_RECORD_REPOSITORY_PORT,
  type SourceRecordRepositoryPort,
} from '../port/out/repository/source-record.repository.port';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/runtime/sourcing-agent.gateway.port';
import {
  SALES_PRODUCT_DRAFT_PORT,
  type SalesProductDraftFacts,
  type SalesProductDraftPort,
} from '../port/out/cross-domain/sales-product-draft.port';
import type {
  CreateProductGenerationCommand,
  RegisterManualProductCommand,
} from '../port/in/sourcing.commands';

const MANUAL_PRODUCT_REGISTRATION_PLATFORM = 'KIDITEM_PRODUCT_REGISTRATION';

interface ProductGenerationRequestCoordinate {
  idempotencyKey: string;
  requestHash: string;
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** 화면이 쉼표로 적어 보내는 색상 이름. 초안 컬럼과 같은 배열 모양으로 맞춘다. */
function splitNames(value: string | null | undefined): string[] {
  return uniqueNonEmptyStrings((value ?? '').split(','));
}

function parseCount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const count = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}


/**
 * 직접 작성 — 사람이 적은 상품 정보로 초안을 만든다(KID-313). 원천에서 가져온 것이 아니라 원본 기록은
 * 없다(`sourceRecordId = null`, `sourcePlatform = KIDITEM_PRODUCT_REGISTRATION`). 초안은 사람이 적은
 * 칸을 그대로 받는다.
 */
@Injectable()
export class SourcingAgentCommandService {
  constructor(
    @Inject(SOURCE_RECORD_REPOSITORY_PORT)
    private readonly records: SourceRecordRepositoryPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
    @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly drafts: SalesProductDraftPort,
  ) {}

  /** 상품 등록 초안 하나(원본 기록 없음). */
  async registerManualProduct(
    data: RegisterManualProductCommand,
    organizationId: string,
  ) {
    const facts = manualDraftFacts(data);
    const { salesProductId } = await this.records.runInTransaction(
      (transaction) => this.drafts.createDraft(transaction, organizationId, facts),
    );
    return {
      ok: true,
      message: '상품 등록 초안이 생성되었습니다.',
      product_count: 1,
      salesProductId,
      href: collectedDraftHref(salesProductId),
    };
  }

  async createProductGeneration(
    data: CreateProductGenerationCommand,
    organizationId: string,
    triggeredByUserId: string | null,
    coordinate: ProductGenerationRequestCoordinate,
  ) {
    const facts = manualDraftFacts(data);
    let salesProductId: string;
    try {
      ({ salesProductId } = await this.records.runOnce({
        organizationId,
        capabilityKey: 'sourcing.product_generation',
        idempotencyKey: coordinate.idempotencyKey,
        requestHash: coordinate.requestHash,
      }, (transaction) => this.drafts.createDraft(transaction, organizationId, facts)));
    } catch (error) {
      if (error instanceof Error && error.message === 'owner_idempotency_input_conflict') {
        throw new ConflictException('product_generation_idempotency_conflict');
      }
      throw error;
    }

    // 이미 있는 상세페이지를 올린 등록. AI 상세페이지 · 썸네일 생성을 돌리지 않는다
    // (사장님 2026-09-22: "상세페이지 섬네일 이미지 생성하지말고 등록하는 걸로").
    const detailPageImageUrls = uniqueNonEmptyStrings(data.detailPageImageUrls ?? []);
    if (detailPageImageUrls.length > 0) {
      const uploaded = await this.agentGateway.registerUploadedDetailPage({
        organizationId,
        triggeredByUserId,
        salesProductId,
        productName: data.title.trim(),
        detailPageImageUrls,
      });
      return {
        ok: true,
        message: '올린 상세페이지로 상품을 등록했습니다.',
        product_count: 1,
        salesProductId: uploaded.salesProductId,
        href: uploaded.href,
        detailPageId: uploaded.detailPageId,
        thumbnailGenerationId: null,
        contentWorkspaceId: uploaded.contentWorkspaceId,
      };
    }

    const thumbnailUrls = uniqueNonEmptyStrings(data.thumbnailUrls ?? []).slice(0, 10);
    const representativeThumbnailUrl = typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim()
      ? data.thumbnailUrl.trim()
      : thumbnailUrls[0] ?? null;
    const ai = await this.agentGateway.startProductGeneration({
      organizationId,
      triggeredByUserId,
      idempotencyKey: coordinate.idempotencyKey,
      requestHash: coordinate.requestHash,
      salesProductId,
      // 직접 작성은 원본 기록이 없다.
      sourceCandidateId: null,
      productBrief: {
        productName: data.title.trim(),
        category: data.category ?? null,
        description: data.description ?? null,
        target: data.target ?? null,
        imageUrls: uniqueNonEmptyStrings(data.imageUrls),
        thumbnailUrl: representativeThumbnailUrl,
        optionNames: uniqueNonEmptyStrings(data.optionNames ?? []),
        productSize: data.productSize ?? null,
        colorVariantStatus: data.colorVariantStatus ?? 'auto',
        colorVariantNames: splitNames(data.colorVariantNames),
        boxSetStatus: data.boxSetStatus ?? 'auto',
        boxSetQuantity: parseCount(data.boxSetQuantity),
      },
      templateId: data.templateId ?? 'bold-vertical',
      ageGroup: data.ageGroup ?? 'age-8-plus',
      detailImageCount: data.detailImageCount ?? '2',
      usageSectionMode: data.usageSectionMode ?? 'include',
      kcCertificationStatus: data.kcCertificationStatus ?? 'unknown',
      kcCertificationNumber: data.kcCertificationNumber ?? null,
    });
    return {
      ok: true,
      message: '상품 생성 작업이 시작되었습니다.',
      product_count: 1,
      salesProductId: ai.salesProductId,
      href: ai.href,
      detailPageId: ai.detailPageId,
      thumbnailGenerationId: ai.thumbnailGenerationId,
      contentWorkspaceId: ai.contentWorkspaceId,
    };
  }
}

/**
 * 사람이 적은 상품 정보 → 초안의 첫 값. 원본 기록이 없으니 여기서 넘기지 않은 칸은 초안에서 비어 있고,
 * 사람이 수집상품 화면에서 채운다.
 */
function manualDraftFacts(data: RegisterManualProductCommand): SalesProductDraftFacts {
  const title = data.title.trim();
  const imageUrls = uniqueNonEmptyStrings(data.imageUrls);
  if (!title) throw new BadRequestException('상품명을 입력해 주세요.');
  if (imageUrls.length === 0) throw new BadRequestException('상품 이미지를 1장 이상 추가해 주세요.');
  const thumbnailUrl = typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim()
    ? data.thumbnailUrl.trim()
    : uniqueNonEmptyStrings(data.thumbnailUrls ?? [])[0] ?? imageUrls[0];
  const primaryFirst = imageUrls.includes(thumbnailUrl!)
    ? [thumbnailUrl!, ...imageUrls.filter((url) => url !== thumbnailUrl)]
    : imageUrls;
  const kcNumber = trimmedOrNull(data.kcCertificationNumber);
  // 인증 번호를 적었으면 인증이 있는 것이다 — 번호 없이 '있음'만 고른 경우도 그대로 둔다.
  const kcStatus = kcNumber ? 'exists'
    : data.kcCertificationStatus === 'exists' || data.kcCertificationStatus === 'none'
      ? data.kcCertificationStatus
      : 'unknown';
  return {
    sourceRecordId: null,
    name: title,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    imageUrls: primaryFirst,
    sourcePlatform: MANUAL_PRODUCT_REGISTRATION_PLATFORM,
    sourceUrl: null,
    optionNames: uniqueNonEmptyStrings(data.optionNames ?? []),
    basics: {
      standardCategory: trimmedOrNull(data.category ?? undefined),
      targetAudience: trimmedOrNull(data.target ?? undefined),
      ageGroup: trimmedOrNull(data.ageGroup ?? undefined),
      productSize: trimmedOrNull(data.productSize ?? undefined),
      colorVariantNames: splitNames(data.colorVariantNames),
      boxSetQuantity: parseCount(data.boxSetQuantity),
      brand: trimmedOrNull(data.brand),
      manufacturer: trimmedOrNull(data.manufacturer),
      originCountry: trimmedOrNull(data.originCountry),
      modelName: trimmedOrNull(data.modelName),
      keywords: uniqueNonEmptyStrings(data.keywords ?? []).slice(0, 10),
      kcStatus,
      ownCode: trimmedOrNull(data.ownCode),
      taxType: data.taxType === 'tax_free' ? 'tax_free' : 'taxable',
      deliveryFeeType: deliveryFeeTypeOrNull(data.deliveryFeeType),
      deliveryFee: typeof data.deliveryFee === 'number' && Number.isFinite(data.deliveryFee) && data.deliveryFee >= 0
        ? Math.round(data.deliveryFee)
        : null,
      certifications: kcNumber
        ? [{ number: kcNumber, issuer: trimmedOrNull(data.certificationIssuer), field: trimmedOrNull(data.certificationField) }]
        : [],
    },
    salePrice: positiveOrNull(data.salePrice),
    normalPrice: positiveOrNull(data.tagPrice),
  };
}

/** 0 이하 · 숫자가 아니면 null. 사방넷 가격 칸은 "안 적음"과 0원을 구분한다. */
function positiveOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

const DELIVERY_FEE_TYPES = ['free', 'collect', 'prepay', 'collect_or_prepay'] as const;

function deliveryFeeTypeOrNull(value: string | undefined): (typeof DELIVERY_FEE_TYPES)[number] | null {
  const text = value?.trim();
  return (DELIVERY_FEE_TYPES as readonly string[]).includes(text ?? '')
    ? text as (typeof DELIVERY_FEE_TYPES)[number]
    : null;
}

function trimmedOrNull(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
