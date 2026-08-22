import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  CreateProductGenerationCommand,
  RegisterManualProductCommand,
} from '../port/in/sourcing.commands';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/runtime/sourcing-agent.gateway.port';

const MANUAL_PRODUCT_REGISTRATION_PLATFORM = 'KIDITEM_PRODUCT_REGISTRATION';

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
  ) {}

  async registerManualProduct(
    data: RegisterManualProductCommand,
    organizationId: string,
    triggeredByUserId: string | null,
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
    const sourceUrl = `kiditem://manual-product-registration/${randomUUID()}`;
    const candidate = await this.candidates.upsertSourced({
      organizationId,
      sourceUrl,
      sourcePlatform: MANUAL_PRODUCT_REGISTRATION_PLATFORM,
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
        boxSetQuantity: data.boxSetQuantity ?? null,
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
    });

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
  ) {
    const thumbnailUrls = uniqueNonEmptyStrings(data.thumbnailUrls ?? []).slice(0, 10);
    const representativeThumbnailUrl = typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.trim()
      ? data.thumbnailUrl.trim()
      : thumbnailUrls[0] ?? null;
    const candidate = await this.registerManualProduct(
      data,
      organizationId,
      triggeredByUserId,
    );
    const ai = await this.agentGateway.startProductGeneration({
      organizationId,
      triggeredByUserId,
      candidateId: candidate.candidateId,
      productName: data.title.trim(),
      category: data.category ?? null,
      description: data.description ?? null,
      target: data.target ?? null,
      imageUrls: uniqueNonEmptyStrings(data.imageUrls),
      thumbnailUrl: representativeThumbnailUrl,
      optionNames: uniqueNonEmptyStrings(data.optionNames ?? []),
      templateId: data.templateId ?? 'bold-vertical',
      ageGroup: data.ageGroup ?? 'age-8-plus',
      detailImageCount: data.detailImageCount ?? '2',
      usageSectionMode: data.usageSectionMode ?? 'include',
      kcCertificationStatus: data.kcCertificationStatus ?? 'unknown',
      kcCertificationNumber: data.kcCertificationNumber ?? null,
      productSize: data.productSize ?? null,
      colorVariantStatus: data.colorVariantStatus ?? 'auto',
      colorVariantNames: data.colorVariantNames ?? null,
      boxSetStatus: data.boxSetStatus ?? 'auto',
      boxSetQuantity: data.boxSetQuantity ?? null,
    });
    return {
      ok: true,
      message: '상품 생성 작업이 시작되었습니다.',
      product_count: 1,
      candidateId: candidate.candidateId,
      href: ai.href,
      parentOperationKey: ai.parentOperationKey,
      detailGenerationId: ai.detailGenerationId,
      thumbnailGenerationId: ai.thumbnailGenerationId,
      contentWorkspaceId: ai.contentWorkspaceId,
    };
  }

}
