import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DetailPageGenerationService } from './detail-page-generation.service';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';
import { ThumbnailGenerationJobService } from './thumbnail-generation-job.service';
import { ProductGenerationAlertService } from './product-generation-alert.service';
import {
  productGenerationOperationKey,
  type ParentProductGenerationAlertLink,
} from './product-generation-alert-link';
import type {
  ProductGenerationAiRequest,
  ProductGenerationAiResult,
  ProductGenerationAiTriggerPort,
} from '../port/in/product-generation-ai-trigger.port';

@Injectable()
export class ProductGenerationAiService implements ProductGenerationAiTriggerPort {
  private readonly logger = new Logger(ProductGenerationAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly detailPages: DetailPageGenerationService,
    private readonly thumbnails: ThumbnailGenerationJobService,
    private readonly editorAi: ThumbnailEditorAiService,
    private readonly parentAlerts: ProductGenerationAlertService,
  ) {}

  async startForCandidate(
    input: ProductGenerationAiRequest,
  ): Promise<ProductGenerationAiResult> {
    const candidate = await this.prisma.sourcingCandidate.findFirst({
      where: {
        id: input.candidateId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        thumbnailUrl: true,
        images: {
          where: { isDeleted: false },
          orderBy: { sortOrder: 'asc' },
          select: { url: true, sortOrder: true },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');

    const batchId = randomUUID();
    const parentOperationKey = productGenerationOperationKey(batchId);
    const href = `/product-pipeline/collected-products/${encodeURIComponent(input.candidateId)}`;
    const productName = input.productName.trim() || candidate.name;

    await this.parentAlerts.start({
      organizationId: input.organizationId,
      actorUserId: input.triggeredByUserId,
      batchId,
      candidateId: input.candidateId,
      productName,
      href,
    });

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

    let detailGenerationId: string | null = null;
    let contentWorkspaceId: string | null = null;
    try {
      const detail = await this.detailPages.generate(
        {
          rawTitle: productName,
          rawCategory: input.category ?? candidate.category ?? '',
          rawDescription,
          rawOptions,
          imageUrls,
          heroImageMode: 'llm-pick',
          productId: undefined,
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

    let thumbnailGenerationId: string | null = null;
    try {
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
      const thumbnail = await this.thumbnails.enqueueCandidateGeneration({
        organizationId: input.organizationId,
        sourceCandidateId: input.candidateId,
        productName,
        contentWorkspaceId,
        triggeredByUserId: input.triggeredByUserId,
        inputs: [resolved],
        inputMeta: {
          mode: 'edit',
          editCase: 'single',
          method: 'generate',
          trigger: 'product_generation',
          inputCount: 1,
          inputRoles: [resolved.role],
          inputLabels: [resolved.label],
        },
        method: 'generate',
        originalUrl,
        agentPayload: {
          mode: 'edit',
          editCase: 'single',
          productName,
          productDescription: input.description ?? candidate.description ?? '',
          category: input.category ?? candidate.category ?? null,
          inputs: [
            {
              data: resolved.data,
              mimeType: resolved.mimeType,
              label: resolved.label,
              url: resolved.url,
              storageKey: resolved.storageKey,
              role: resolved.role,
              sortOrder: resolved.sortOrder,
              source: resolved.source,
              fileSize: resolved.fileSize,
            },
          ],
        },
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
