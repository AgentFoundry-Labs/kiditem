import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/runtime/sourcing-agent.gateway.port';
import {
  SALES_PRODUCT_DRAFT_PORT,
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

function collectedCandidateHref(candidateId: string): string {
  return `/product-pipeline/collected-products/${encodeURIComponent(candidateId)}`;
}

@Injectable()
export class SourcingAgentCommandService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
    @Optional() @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly salesProductDrafts?: SalesProductDraftPort,
  ) {}

  async registerManualProduct(
    data: RegisterManualProductCommand,
    organizationId: string,
    triggeredByUserId: string | null,
    idempotencyKey?: string,
  ) {
    const candidateInput = this.manualProductCandidateInput(
      data,
      organizationId,
      triggeredByUserId,
      idempotencyKey,
    );
    const candidate = await this.candidates.upsertSourced(candidateInput);

    return {
      ok: true,
      message: '상품 등록 후보가 생성되었습니다.',
      product_count: 1,
      candidateId: candidate.id,
      href: collectedCandidateHref(candidate.id),
    };
  }

  async createProductGeneration(
    data: CreateProductGenerationCommand,
    organizationId: string,
    triggeredByUserId: string | null,
    coordinate: ProductGenerationRequestCoordinate,
  ) {
    const candidateInput = this.manualProductCandidateInput(
      data,
      organizationId,
      triggeredByUserId,
      coordinate.idempotencyKey,
    );
    let candidate: { candidateId: string };
    try {
      candidate = await this.candidates.upsertSourcedWithIdempotencyReceipt({
        ...candidateInput,
        capabilityKey: 'sourcing.product_generation',
        idempotencyKey: coordinate.idempotencyKey,
        requestHash: coordinate.requestHash,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'owner_idempotency_input_conflict') {
        throw new ConflictException('product_generation_idempotency_conflict');
      }
      throw error;
    }

    // 이미 있는 상세페이지를 올린 등록. AI 상세페이지 · 썸네일 생성을 돌리지 않는다
    // (사장님 2026-09-22: "상세페이지 섬네일 이미지 생성하지말고 등록하는 걸로").
    // 수집이 후보를 담을 때 판매상품 초안 하나가 함께 생긴다(KID-310). 콘텐츠는 그 초안이 가진다.
    const salesProductId = await this.requireDraftId(organizationId, candidate.candidateId);
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
        candidateId: candidate.candidateId,
        salesProductId: uploaded.salesProductId,
        href: uploaded.href,
        detailGenerationId: uploaded.detailGenerationId,
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
      sourceCandidateId: candidate.candidateId,
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
      candidateId: candidate.candidateId,
      salesProductId: ai.salesProductId,
      href: ai.href,
      detailGenerationId: ai.detailGenerationId,
      thumbnailGenerationId: ai.thumbnailGenerationId,
      contentWorkspaceId: ai.contentWorkspaceId,
    };
  }

  /** 후보의 편집 정본. 수집이 초안을 만들지 못했으면 생성할 대상이 없다. */
  private async requireDraftId(organizationId: string, candidateId: string): Promise<string> {
    const salesProductId = await this.salesProductDrafts?.findDraftIdForSource(organizationId, candidateId);
    if (!salesProductId) {
      throw new NotFoundException('이 수집상품의 판매상품 초안을 찾지 못했습니다.');
    }
    return salesProductId;
  }

  private manualProductCandidateInput(
    data: RegisterManualProductCommand,
    organizationId: string,
    triggeredByUserId: string | null,
    idempotencyKey?: string,
  ) {
    const title = data.title.trim();
    const imageUrls = uniqueNonEmptyStrings(data.imageUrls);
    if (!title) throw new BadRequestException('상품명을 입력해 주세요.');
    if (imageUrls.length === 0) throw new BadRequestException('상품 이미지를 1장 이상 추가해 주세요.');

    const thumbnailUrls = uniqueNonEmptyStrings(data.thumbnailUrls ?? []).slice(0, 10);
    const thumbnailUrl = typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim()
      ? data.thumbnailUrl.trim()
      : thumbnailUrls[0] ?? imageUrls[0];
    const allThumbnailUrls = uniqueNonEmptyStrings([thumbnailUrl, ...thumbnailUrls]).slice(0, 10);
    const primaryImageUrl = imageUrls.includes(thumbnailUrl) ? thumbnailUrl : imageUrls[0];
    const category = typeof data.category === 'string' && data.category.trim()
      ? data.category.trim()
      : null;
    const description = typeof data.description === 'string' && data.description.trim()
      ? data.description.trim()
      : '';
    const optionNames = uniqueNonEmptyStrings(data.optionNames ?? []);
    const keywords = uniqueNonEmptyStrings(data.keywords ?? []).slice(0, 10);
    const identityHash = idempotencyKey
      ? createHash('sha256').update(idempotencyKey).digest('hex')
      : null;
    const sourceUrl = identityHash
      ? `kiditem://manual-product-registration/${identityHash}`
      : `kiditem://manual-product-registration/${randomUUID()}`;
    return {
      organizationId,
      sourceUrl,
      sourcePlatform: MANUAL_PRODUCT_REGISTRATION_PLATFORM,
      sourceIdentityHash: identityHash,
      rawData: {
        source: 'kiditem_product_registration',
        title,
        category,
        description,
        target: data.target ?? null,
        ageGroup: data.ageGroup ?? null,
        kcCertificationStatus: data.kcCertificationStatus ?? null,
        kcCertificationNumber: data.kcCertificationNumber ?? null,
        productSize: data.productSize ?? null,
        colorVariantStatus: data.colorVariantStatus ?? null,
        colorVariantNames: data.colorVariantNames ?? null,
        boxSetStatus: data.boxSetStatus ?? null,
        boxSetQuantity: parseCount(data.boxSetQuantity),
        // 사방넷 신규등록과 같은 칸 — 상품 등록 초안에서 받은 값이 판매상품까지 간다.
        salePrice: positiveOrNull(data.salePrice),
        tagPrice: positiveOrNull(data.tagPrice),
        costPrice: positiveOrNull(data.costPrice),
        brand: trimmedOrNull(data.brand),
        manufacturer: trimmedOrNull(data.manufacturer),
        originCountry: trimmedOrNull(data.originCountry),
        modelName: trimmedOrNull(data.modelName),
        ownCode: trimmedOrNull(data.ownCode),
        taxType: data.taxType === 'tax_free' ? 'tax_free' : null,
        deliveryFee: typeof data.deliveryFee === 'number' && data.deliveryFee >= 0 ? Math.round(data.deliveryFee) : null,
        deliveryFeeType: trimmedOrNull(data.deliveryFeeType),
        certificationIssuer: trimmedOrNull(data.certificationIssuer),
        certificationField: trimmedOrNull(data.certificationField),
        thumbnailUrl,
        thumbnailUrls: allThumbnailUrls,
        imageUrls,
        optionNames,
        keywords,
      },
      name: title,
      description,
      category,
      tags: optionNames,
      thumbnailUrl,
      imageUrl: thumbnailUrl,
      costCny: null,
      triggeredByUserId,
      images: imageUrls.map((url, index) => ({
        url,
        role: 'product',
        label: null,
        sortOrder: index,
        source: 'kiditem-product-registration',
        isPrimary: url === primaryImageUrl,
      })),
    };
  }

}

/** 0 이하 · 숫자가 아니면 null. 사방넷 가격 칸은 "안 적음"과 0원을 구분한다. */
function positiveOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function trimmedOrNull(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
