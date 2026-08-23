import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DetailPageGenerationService } from './detail-page-generation.service';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';
import { ThumbnailGenerationJobService } from './thumbnail-generation-job.service';
import { ProductGenerationAlertService } from './product-generation-alert.service';
import {
  buildThumbnailGenerateDirectInput,
  buildThumbnailGenerationInputMeta,
} from './thumbnail-generation-requests';
import {
  productGenerationOperationKey,
  type ParentProductGenerationAlertLink,
} from './product-generation-alert-link';
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
  ProductGenerationAiTriggerPort,
} from '../port/in/generation/product-generation-ai-trigger.port';
import {
  PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
  type ProductGenerationContextRepositoryPort,
} from '../port/out/repository/product-generation-context.repository.port';
import {
  PRODUCT_GENERATION_IDEMPOTENCY_PORT,
  type ProductGenerationIdempotencyPort,
} from '../port/out/transaction/product-generation-idempotency.port';

@Injectable()
export class ProductGenerationAiService implements ProductGenerationAiTriggerPort {
  private readonly logger = new Logger(ProductGenerationAiService.name);

  constructor(
    @Inject(PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT)
    private readonly contextRepository: ProductGenerationContextRepositoryPort,
    private readonly detailPages: DetailPageGenerationService,
    private readonly thumbnails: ThumbnailGenerationJobService,
    private readonly editorAi: ThumbnailEditorAiService,
    private readonly parentAlerts: ProductGenerationAlertService,
    @Inject(PRODUCT_GENERATION_IDEMPOTENCY_PORT)
    private readonly idempotency: ProductGenerationIdempotencyPort,
  ) {}

  async startForCandidate(
    input: ProductGenerationAiRequest,
  ): Promise<ProductGenerationAiResult> {
    if (!input.idempotencyKey?.trim() || !input.requestHash?.trim()) {
      throw new Error('product_generation_idempotency_required');
    }
    return this.idempotency.runExclusive(
      {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
      () => this.startClaimed(input),
    );
  }

  private async startClaimed(
    input: ProductGenerationAiRequest,
  ): Promise<ProductGenerationAiResult> {
    const candidate = await this.contextRepository.findCandidate({
      organizationId: input.organizationId,
      candidateId: input.candidateId,
    });
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');

    const batchId = createHash('sha256')
      .update(`${input.organizationId}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 32);
    const parentOperationKey = productGenerationOperationKey(batchId);
    const href = `/product-pipeline/collected-products/${encodeURIComponent(input.candidateId)}`;
    const productName = input.productName.trim() || candidate.name;
    const includeDetailPage = input.task !== 'thumbnail';
    const includeThumbnail = input.task !== 'detail';

    const existingParent = await this.parentAlerts.find(
      input.organizationId,
      parentOperationKey,
    );
    const existingMetadata = asRecord(existingParent?.metadata);
    if (
      existingParent
      && existingMetadata.requestHash !== input.requestHash
    ) {
      throw new Error('product_generation_idempotency_conflict');
    }
    if (!existingParent) {
      await this.parentAlerts.start({
        organizationId: input.organizationId,
        actorUserId: input.triggeredByUserId,
        batchId,
        candidateId: input.candidateId,
        productName,
        href,
        includeDetailPage,
        includeThumbnail,
        requestHash: input.requestHash,
      });
    }
    const existingChildIds = asRecord(existingMetadata.childIds);

    const detailLink: ParentProductGenerationAlertLink = {
      mode: 'parent',
      batchId,
      parentOperationKey,
      childKind: 'detail_page',
    };
    const thumbnailLink: ParentProductGenerationAlertLink = {
      mode: 'parent',
      batchId,
      parentOperationKey,
      childKind: 'thumbnail',
    };

    const imageUrls = input.imageUrls.length > 0
      ? input.imageUrls
      : candidate.images.map((image) => image.url).filter(Boolean);
    const rawDescription = buildProductGenerationDescription(input, candidate.description);
    const rawOptions = input.optionNames.join('\n');

    let detailGenerationId = stringOrNull(existingChildIds.detailPageGenerationId);
    let contentWorkspaceId: string | null = null;
    if (includeDetailPage && !detailGenerationId) try {
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
        { operationAlert: detailLink },
      );
      detailGenerationId = detail.id;
      contentWorkspaceId = detail.contentWorkspaceId ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `product generation detail child failed (candidate=${input.candidateId}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.parentAlerts.markChildFinished({
        organizationId: input.organizationId,
        parentOperationKey,
        childKind: 'detail_page',
        status: 'failed',
        childId: 'detail-enqueue',
        errorMessage: message,
      });
    }

    let thumbnailGenerationId = stringOrNull(existingChildIds.thumbnailGenerationId);
    if (includeThumbnail && !thumbnailGenerationId) try {
      const canStartThumbnail = await this.parentAlerts.canStartChild({
        organizationId: input.organizationId,
        parentOperationKey,
      });
      if (!canStartThumbnail) {
        return {
          candidateId: input.candidateId,
          parentOperationKey,
          detailGenerationId,
          thumbnailGenerationId,
          contentWorkspaceId,
          href,
        };
      }

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
        operationAlert: thumbnailLink,
      });
      thumbnailGenerationId = thumbnail.generationId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `product generation thumbnail child failed (candidate=${input.candidateId}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.parentAlerts.markChildFinished({
        organizationId: input.organizationId,
        parentOperationKey,
        childKind: 'thumbnail',
        status: 'failed',
        childId: 'thumbnail-enqueue',
        errorMessage: message,
      });
    }

    return {
      candidateId: input.candidateId,
      parentOperationKey,
      detailGenerationId,
      thumbnailGenerationId,
      contentWorkspaceId,
      href,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
