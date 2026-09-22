import { ConflictException, Inject, Injectable } from '@nestjs/common';
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
import { ContentWorkspaceService } from './content-workspace.service';
import { DetailPageQueryService } from './detail-page-query.service';
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
  ProductGenerationProductBrief,
  ProductGenerationAiTriggerPort,
  RegisterUploadedDetailPageRequest,
  RegisterUploadedDetailPageResult,
} from '../port/in/generation/product-generation-ai-trigger.port';

@Injectable()
export class ProductGenerationAiService implements ProductGenerationAiTriggerPort {
  constructor(
    @Inject(PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT)
    private readonly contextRepository: ProductGenerationContextRepositoryPort,
    private readonly detailPages: DetailPageGenerationService,
    private readonly thumbnails: ThumbnailGenerationJobService,
    private readonly editorAi: ThumbnailEditorAiService,
    private readonly contentWorkspaces: ContentWorkspaceService,
    private readonly detailPageQueries: DetailPageQueryService,
  ) {}

  async startForSalesProduct(
    input: ProductGenerationAiRequest,
  ): Promise<ProductGenerationAiResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    const requestHash = input.requestHash?.trim();
    if (!idempotencyKey || !requestHash) {
      throw new Error('product_generation_idempotency_required');
    }
    return this.startClaimed(input, { idempotencyKey, requestHash });
  }

  /**
   * 올린 상세페이지를 그 상품의 현재 상세페이지로 건다. AI 는 부르지 않는다.
   *
   * 워크스페이스는 생성 경로와 **같은 `ensureForGeneration`** 으로 연다 — 여기서 따로 만들면
   * 같은 상품이 워크스페이스 두 개를 갖게 된다.
   */
  async registerUploadedDetailPage(
    input: RegisterUploadedDetailPageRequest,
  ): Promise<RegisterUploadedDetailPageResult> {
    const productName = input.productName.trim();
    if (!productName) throw new ConflictException('product_generation_product_name_required');
    const workspace = await this.contentWorkspaces.ensureForGeneration({
      organizationId: input.organizationId,
      triggeredByUserId: input.triggeredByUserId,
      rawTitle: productName,
      salesProductId: input.salesProductId,
    });
    const created = await this.detailPageQueries.registerUploaded({
      organizationId: input.organizationId,
      triggeredByUserId: input.triggeredByUserId,
      contentWorkspaceId: workspace.id,
      title: productName,
      imageUrls: input.detailPageImageUrls,
    });
    await this.contentWorkspaces.selectCurrentDetailPage({
      organizationId: input.organizationId,
      workspaceId: workspace.id,
      contentGenerationId: created.id,
    });
    return {
      salesProductId: input.salesProductId,
      detailGenerationId: created.id,
      contentWorkspaceId: workspace.id,
      href: salesProductHref(input.salesProductId),
    };
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
    const href = salesProductHref(input.salesProductId);
    const includeDetailPage = input.task !== 'thumbnail';
    const includeThumbnail = input.task !== 'detail';
    const detailAlreadyAdmitted = !includeDetailPage || Boolean(existingChildren.detail);
    const thumbnailAlreadyAdmitted = !includeThumbnail || Boolean(existingChildren.thumbnail);

    if (detailAlreadyAdmitted && thumbnailAlreadyAdmitted) {
      return {
        salesProductId: input.salesProductId,
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
    const brief = input.productBrief;
    const productName = brief.productName.trim();
    if (!productName) throw new ConflictException('product_generation_product_name_required');

    const imageUrls = brief.imageUrls.filter(Boolean);
    const rawDescription = buildProductGenerationDescription(brief);
    const rawOptions = brief.optionNames.join('\n');

    let detailGenerationId: string | null = existingChildren.detail?.generationId ?? null;
    let contentWorkspaceId: string | null = existingChildren.detail?.contentWorkspaceId ?? null;
    if (includeDetailPage && !existingChildren.detail) {
      const detail = await this.detailPages.generate(
        {
          rawTitle: productName,
          rawCategory: brief.category ?? '',
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
          sourceReferences: input.sourceCandidateId
            ? [
                {
                  sourceType: 'sourcing_candidate' as const,
                  sourceCandidateId: input.sourceCandidateId,
                  label: productName,
                },
              ]
            : [],
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
      const originalUrl = brief.thumbnailUrl ?? imageUrls[0] ?? '';
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
        productDescription: brief.description ?? '',
        category: brief.category ?? null,
        inputs: [resolved],
      });
      const thumbnail = await this.thumbnails.enqueueSalesProductGeneration({
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
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
      salesProductId: input.salesProductId,
      detailGenerationId,
      thumbnailGenerationId,
      contentWorkspaceId,
      href,
    };
  }
}

function salesProductHref(salesProductId: string): string {
  return `/product-pipeline/collected-products/${encodeURIComponent(salesProductId)}`;
}

function buildProductGenerationDescription(brief: ProductGenerationProductBrief): string {
  return [
    textLine('특징', brief.description),
    textLine('주요 타겟', brief.target),
    textLine('제품 사이즈', brief.productSize),
    textLine(
      '색상 구성',
      joinParts(brief.colorVariantStatus, brief.colorVariantNames),
    ),
    textLine(
      '박스/세트',
      joinParts(brief.boxSetStatus, brief.boxSetQuantity),
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
