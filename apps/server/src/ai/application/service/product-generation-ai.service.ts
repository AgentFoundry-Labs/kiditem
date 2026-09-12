import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
  type ProductGenerationContextRepositoryPort,
} from '../port/out/repository/product-generation-context.repository.port';
import { DetailPageGenerationService } from './detail-page-generation.service';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';
import { ThumbnailGenerationJobService } from './thumbnail-generation-job.service';
import { deriveProductGenerationChildIdentity } from './product-generation-child-identity';
import {
  buildThumbnailGenerateDirectInput,
  buildThumbnailGenerationInputMeta,
} from './thumbnail-generation-requests';
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
  ProductGenerationAiTriggerPort,
} from '../port/in/generation/product-generation-ai-trigger.port';

@Injectable()
export class ProductGenerationAiService implements ProductGenerationAiTriggerPort {
  constructor(
    @Inject(PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT)
    private readonly contextRepository: ProductGenerationContextRepositoryPort,
    private readonly detailPages: DetailPageGenerationService,
    private readonly thumbnails: ThumbnailGenerationJobService,
    private readonly editorAi: ThumbnailEditorAiService,
  ) {}

  async startForCandidate(
    input: ProductGenerationAiRequest,
  ): Promise<ProductGenerationAiResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    const requestHash = input.requestHash?.trim();
    if (!idempotencyKey || !requestHash) {
      throw new Error('product_generation_idempotency_required');
    }
    return this.startClaimed(input, { idempotencyKey, requestHash });
  }

  private async startClaimed(
    input: ProductGenerationAiRequest,
    coordinate: { idempotencyKey: string; requestHash: string },
  ): Promise<ProductGenerationAiResult> {
    const detailProductGenerationIdentity = deriveProductGenerationChildIdentity({
      organizationId: input.organizationId,
      idempotencyKey: coordinate.idempotencyKey,
      requestHash: coordinate.requestHash,
      kind: 'detail_page',
    });
    const thumbnailProductGenerationIdentity = deriveProductGenerationChildIdentity({
      organizationId: input.organizationId,
      idempotencyKey: coordinate.idempotencyKey,
      requestHash: coordinate.requestHash,
      kind: 'thumbnail',
    });
    const existingChildren = await this.contextRepository.findExistingChildren({
      organizationId: input.organizationId,
      detailGenerationId: detailProductGenerationIdentity.generationId,
      thumbnailGenerationId: thumbnailProductGenerationIdentity.generationId,
    });
    const existingChildHashes = [
      existingChildren.detail,
      existingChildren.thumbnail,
    ].filter((child): child is NonNullable<typeof child> => Boolean(child));
    if (existingChildHashes.some((child) => child.isDeleted)) {
      throw new ConflictException('product_generation_idempotency_conflict');
    }
    if (existingChildHashes.some((child) => child.requestHash !== coordinate.requestHash)) {
      throw new ConflictException('product_generation_idempotency_conflict');
    }
    const href = `/product-pipeline/collected-products/${encodeURIComponent(input.candidateId)}`;
    const includeDetailPage = input.task !== 'thumbnail';
    const includeThumbnail = input.task !== 'detail';
    const detailAlreadyAdmitted = !includeDetailPage || Boolean(existingChildren.detail);
    const thumbnailAlreadyAdmitted = !includeThumbnail || Boolean(existingChildren.thumbnail);

    if (detailAlreadyAdmitted && thumbnailAlreadyAdmitted) {
      return {
        candidateId: input.candidateId,
        detailGenerationId: includeDetailPage
          ? existingChildren.detail?.generationId ?? null
          : null,
        thumbnailGenerationId: includeThumbnail
          ? existingChildren.thumbnail?.generationId ?? null
          : null,
        contentWorkspaceId: includeDetailPage
          ? existingChildren.detail?.contentWorkspaceId ?? null
          : null,
        href,
      };
    }
    const candidate = await this.contextRepository.findCandidate({
      organizationId: input.organizationId,
      candidateId: input.candidateId,
    });
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');

    const productName = input.productName.trim() || candidate.name;

    const imageUrls = input.imageUrls.length > 0
      ? input.imageUrls
      : candidate.images.map((image) => image.url).filter(Boolean);
    const rawDescription = buildProductGenerationDescription(input, candidate.description);
    const rawOptions = input.optionNames.join('\n');

    let detailGenerationId: string | null = existingChildren.detail?.generationId ?? null;
    let contentWorkspaceId: string | null = existingChildren.detail?.contentWorkspaceId ?? null;
    if (includeDetailPage && !existingChildren.detail) {
      const detail = await this.detailPages.generate(
        {
          rawTitle: productName,
          rawCategory: input.category ?? candidate.category ?? '',
          rawDescription,
          rawOptions,
          imageUrls,
          heroImageMode: 'llm-pick',
          templateId: input.templateId,
          ageGroup: input.ageGroup,
          detailImageCount: input.detailImageCount,
          usageSectionMode: input.usageSectionMode,
          kcCertificationStatus: input.kcCertificationStatus,
          kcCertificationNumber: input.kcCertificationNumber ?? undefined,
          sourceReferences: [
            {
              sourceType: 'sourcing_candidate',
              sourceCandidateId: input.candidateId,
              label: productName,
            },
          ],
        },
        input.organizationId,
        input.triggeredByUserId,
        detailProductGenerationIdentity,
      );
      detailGenerationId = detail.id;
      contentWorkspaceId = detail.contentWorkspaceId ?? null;
    }

    let thumbnailGenerationId: string | null = existingChildren.thumbnail?.generationId ?? null;
    if (includeThumbnail && !existingChildren.thumbnail) {
      const originalUrl = input.thumbnailUrl ?? imageUrls[0] ?? candidate.thumbnailUrl ?? '';
      const resolved = await this.editorAi.resolveInputImage(
        originalUrl,
        input.organizationId,
        {
          label: 'Product photo',
          role: 'product',
          sortOrder: 0,
          source: 'sourcing_candidate',
        },
      );
      const thumbnailInputMeta = buildThumbnailGenerationInputMeta({
        mode: 'edit',
        editCase: 'single',
        method: 'generate',
        trigger: 'product_generation',
        productName,
        productGenerationRequestHash: coordinate.requestHash,
        inputs: [resolved],
      });
      const thumbnailDirectPayload = buildThumbnailGenerateDirectInput({
        mode: 'edit',
        editCase: 'single',
        productName,
        productDescription: input.description ?? candidate.description ?? '',
        category: input.category ?? candidate.category ?? null,
        inputs: [resolved],
      });
      const thumbnail = await this.thumbnails.enqueueCandidateGeneration({
        organizationId: input.organizationId,
        sourceCandidateId: input.candidateId,
        productName,
        contentWorkspaceId,
        triggeredByUserId: input.triggeredByUserId,
        inputs: [resolved],
        inputMeta: thumbnailInputMeta,
        method: 'generate',
        originalUrl,
        directPayload: thumbnailDirectPayload,
        productGenerationIdentity: thumbnailProductGenerationIdentity,
      });
      thumbnailGenerationId = thumbnail.generationId;
    }

    return {
      candidateId: input.candidateId,
      detailGenerationId,
      thumbnailGenerationId,
      contentWorkspaceId,
      href,
    };
  }
}

function buildProductGenerationDescription(
  input: ProductGenerationAiRequest,
  candidateDescription: string | null,
): string {
  return [
    textLine('특징', input.description ?? candidateDescription),
    textLine('주요 타겟', input.target),
    textLine('제품 사이즈', input.productSize),
    textLine(
      '색상 구성',
      joinParts(input.colorVariantStatus, input.colorVariantNames),
    ),
    textLine(
      '박스/세트',
      joinParts(input.boxSetStatus, input.boxSetQuantity),
    ),
  ].filter(Boolean).join('\n');
}

function textLine(label: string, value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : '';
}

function joinParts(
  left: string | null | undefined,
  right: string | null | undefined,
): string {
  return [left, right]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}
