import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../agent-os/application/port/in/agent-runner.port';
import {
  AI_AGENT_SOURCE_TYPES,
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
  THUMBNAIL_GENERATE_AGENT_TYPE,
} from '../../domain/agent-output';
import type {
  ThumbnailEditorInputImage,
  ThumbnailInputRole,
} from '../../domain/model/thumbnail-editor';
import type { DetailPageRawInput, DetailPageTemplateId } from './detail-page-ai.types';
import {
  detailPageOperationKey,
  detailPageResultHref,
} from './detail-page-stored.helpers';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';
import { ContentAssetService } from './content-asset.service';
import type { PostPromotionAiTriggerPort } from '../port/in/post-promotion-ai-trigger.port';

/**
 * AI-domain-owned defaults for post-promotion fire-and-forget generation.
 *
 * - `templateId` is the only kids-products template that ships today (D14).
 * - `heroImageMode='llm-pick'` matches the editor UI default so the auto-fired
 *   run produces the same result as the user clicking Generate.
 * - `ageGroup='age-8-plus'` and `detailImageCount='auto'` mirror the
 *   `DetailPageGenerationService.generate` defaults.
 */
const DEFAULT_TEMPLATE_ID: DetailPageTemplateId = 'kids-playful';
const DEFAULT_HERO_IMAGE_MODE: 'first' | 'llm-pick' = 'llm-pick';
const DEFAULT_AGE_GROUP = 'age-8-plus' as const;
const DEFAULT_DETAIL_IMAGE_COUNT = 'auto' as const;
const THUMBNAIL_METHOD: 'generate' = 'generate';
const THUMBNAIL_MODE: 'edit' = 'edit';

@Injectable()
export class PostPromotionAiService implements PostPromotionAiTriggerPort {
  private readonly logger = new Logger(PostPromotionAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    private readonly operationAlerts: OperationAlertService,
    private readonly editorAi: ThumbnailEditorAiService,
    private readonly contentAssets: ContentAssetService,
  ) {}

  /**
   * Fire detail-page + thumbnail generation for a freshly promoted master.
   *
   * Mirrors `DetailPageGenerationService.enqueueProductBoundGeneration`
   * and `ThumbnailGenerationJobService.enqueueEditorGeneration` so the
   * Agent OS bridge + sink path treats post-promotion runs identically
   * to user-initiated ones (the gen row is the sink's writable target;
   * `sourceResourceId` must point at the gen row, never the master id).
   *
   * Fire-and-forget contract: each path is independently try/catch'd,
   * any failure marks its own gen row FAILED + alert.fail + logs, then
   * the method resolves void. Detail-page failure must not block the
   * thumbnail attempt and vice versa.
   */
  async fireForMaster(masterId: string, organizationId: string): Promise<void> {
    const master = await this.prisma.masterProduct.findFirst({
      where: { id: masterId, organizationId, isDeleted: false },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        imageUrl: true,
      },
    });
    if (!master) {
      this.logger.error(
        `post-promotion fire-for-master skipped: master not found (organization=${organizationId}, master=${masterId})`,
      );
      return;
    }

    const masterImages = await this.prisma.masterProductImage.findMany({
      where: { masterId, organizationId, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
      select: { url: true },
    });
    const imageUrls = masterImages
      .map((row) => row.url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);

    await this.fireDetailPage({ master, organizationId, imageUrls });
    await this.fireThumbnail({ master, organizationId, imageUrls });
  }

  private async fireDetailPage(input: {
    master: { id: string; name: string; category: string | null; description: string };
    organizationId: string;
    imageUrls: string[];
  }): Promise<void> {
    const { master, organizationId, imageUrls } = input;
    const rawInput: DetailPageRawInput = {
      rawTitle: master.name,
      rawCategory: master.category ?? '',
      rawDescription: master.description ?? '',
      rawOptions: '',
      imageUrls,
      heroImageMode: DEFAULT_HERO_IMAGE_MODE,
      templateId: DEFAULT_TEMPLATE_ID,
      ageGroup: DEFAULT_AGE_GROUP,
      detailImageCount: DEFAULT_DETAIL_IMAGE_COUNT,
    };

    let contentGenerationId: string | null = null;
    try {
      const group = await this.ensureProductWorkspaceGroup({
        organizationId,
        productId: master.id,
        title: master.name,
      });
      const row = await this.prisma.contentGeneration.create({
        data: {
          organizationId,
          contentType: 'detail_page',
          generationGroupId: group.id,
          triggeredByUserId: null,
          generationInput: rawInput as unknown as Prisma.InputJsonValue,
          generationResult: {
            templateId: DEFAULT_TEMPLATE_ID,
            result: {},
            imageUrls,
            processedImages: {},
          },
          generatedTitle: master.name.slice(0, 80),
          status: 'PROCESSING',
        },
      });
      contentGenerationId = row.id;
      await this.contentAssets.recordDetailPageInputAssets({
        organizationId,
        generationGroupId: group.id,
        createdByUserId: null,
        imageUrls,
      });

      await this.operationAlerts.start({
        organizationId,
        operationKey: detailPageOperationKey(row.id),
        type: 'detail_page_generation',
        title: `상세페이지 자동 생성: ${master.name.slice(0, 40)}`,
        sourceType: AI_AGENT_SOURCE_TYPES.POST_PROMOTION_DETAIL_PAGE,
        sourceId: row.id,
        actorUserId: null,
        targetType: 'master',
        targetId: master.id,
        href: detailPageResultHref({
          productId: group.targetMasterId,
          contentGenerationId: row.id,
          templateId: DEFAULT_TEMPLATE_ID,
        }),
        metadata: {
          templateId: DEFAULT_TEMPLATE_ID,
          imageCount: imageUrls.length,
          trigger: 'post_promotion',
        },
      });

      const enqueueResult: AgentRunnerResult = await this.agentRunner.runByType(
        DETAIL_PAGE_GENERATE_AGENT_TYPE,
        {
          organizationId,
          sourceType: AI_AGENT_SOURCE_TYPES.POST_PROMOTION_DETAIL_PAGE,
          sourceResourceType: 'content_generation',
          sourceResourceId: row.id,
          reason: `post_promotion detail_page_generate for master ${master.id}`,
          payload: {
            templateId: DEFAULT_TEMPLATE_ID,
            raw: {
              rawTitle: rawInput.rawTitle,
              rawCategory: rawInput.rawCategory,
              rawDescription: rawInput.rawDescription,
              rawOptions: rawInput.rawOptions,
              imageUrls: rawInput.imageUrls,
              ageGroup: rawInput.ageGroup,
              detailImageCount: rawInput.detailImageCount,
            },
            heroImageMode: DEFAULT_HERO_IMAGE_MODE,
          },
        },
      );

      if (!enqueueResult.ok) {
        const errorMessage = enqueueResult.reason
          ? `Agent OS enqueue failed: ${enqueueResult.reason}`
          : 'Agent OS enqueue failed.';
        await this.markDetailPageFailed({
          organizationId,
          contentGenerationId: row.id,
          errorMessage,
          agentReason: enqueueResult.reason ?? null,
        });
        this.logger.error(
          `post-promotion detail_page_generate enqueue rejected (organization=${organizationId}, master=${master.id}, contentGeneration=${row.id}): ${errorMessage}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `post-promotion detail_page_generate failed (organization=${organizationId}, master=${master.id}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (contentGenerationId) {
        await this.markDetailPageFailed({
          organizationId,
          contentGenerationId,
          errorMessage: message,
          agentReason: null,
        });
      }
    }
  }

  private async fireThumbnail(input: {
    master: { id: string; name: string; category: string | null; imageUrl: string | null };
    organizationId: string;
    imageUrls: string[];
  }): Promise<void> {
    const { master, organizationId, imageUrls } = input;
    const originalUrl = master.imageUrl ?? imageUrls[0] ?? '';
    if (!originalUrl) {
      this.logger.warn(
        `post-promotion thumbnail_generate skipped: master has no image (organization=${organizationId}, master=${master.id})`,
      );
      return;
    }

    let generationId: string | null = null;
    try {
      // Resolve the master's primary image into the (base64 data + url +
      // storage key) shape the agent input schema requires. Mirrors the
      // ThumbnailEditorController auto path for a fresh master where the
      // only available input is the primary product photo.
      const inputImage: ThumbnailEditorInputImage = await this.editorAi.resolveInputImage(
        originalUrl,
        organizationId,
        {
          label: 'Product photo',
          role: 'product' as ThumbnailInputRole,
          sortOrder: 0,
          source: 'master_image',
        },
      );

      const inputMeta = {
        mode: THUMBNAIL_MODE,
        editCase: 'single' as const,
        method: THUMBNAIL_METHOD,
        trigger: 'post_promotion' as const,
        inputCount: 1,
        inputRoles: [inputImage.role],
        inputLabels: [inputImage.label],
      };

      const generation = await this.prisma.thumbnailGeneration.create({
        data: {
          organizationId,
          masterId: master.id,
          originalUrl,
          method: THUMBNAIL_METHOD,
          status: 'pending',
          phase: null,
          inputMeta,
          triggeredByUserId: null,
        },
      });
      generationId = generation.id;

      await this.prisma.thumbnailGenerationInputImage.create({
        data: {
          organizationId,
          generationId: generation.id,
          url: inputImage.url,
          storageKey: inputImage.storageKey,
          role: inputImage.role,
          label: inputImage.label,
          sortOrder: inputImage.sortOrder,
          source: inputImage.source,
          mimeType: inputImage.mimeType,
          fileSize: inputImage.fileSize,
        },
      });

      await this.operationAlerts.start({
        organizationId,
        operationKey: this.thumbnailOperationKey(generation.id),
        type: 'thumbnail_edit_job',
        title: `썸네일 자동 생성: ${master.name.slice(0, 40)}`,
        sourceType: AI_AGENT_SOURCE_TYPES.POST_PROMOTION_THUMBNAIL,
        sourceId: generation.id,
        actorUserId: null,
        targetType: 'master',
        targetId: master.id,
        href: this.thumbnailGenerationHref(generation.id),
        metadata: {
          method: THUMBNAIL_METHOD,
          inputCount: 1,
          trigger: 'post_promotion',
        },
      });

      const enqueueResult: AgentRunnerResult = await this.agentRunner.runByType(
        THUMBNAIL_GENERATE_AGENT_TYPE,
        {
          organizationId,
          sourceType: AI_AGENT_SOURCE_TYPES.POST_PROMOTION_THUMBNAIL,
          sourceResourceType: 'thumbnail_generation',
          sourceResourceId: generation.id,
          reason: `post_promotion thumbnail_generate for master ${master.id}`,
          payload: {
            mode: THUMBNAIL_MODE,
            editCase: 'single',
            productName: master.name,
            category: master.category,
            inputs: [
              {
                data: inputImage.data,
                mimeType: inputImage.mimeType,
                label: inputImage.label,
                url: inputImage.url,
                storageKey: inputImage.storageKey,
                role: inputImage.role,
                sortOrder: inputImage.sortOrder,
                source: inputImage.source,
                fileSize: inputImage.fileSize,
              },
            ],
          },
        },
      );

      if (!enqueueResult.ok) {
        const errorMessage = enqueueResult.reason
          ? `Agent OS enqueue failed: ${enqueueResult.reason}`
          : 'Agent OS enqueue failed.';
        await this.markThumbnailFailed({
          organizationId,
          generationId: generation.id,
          errorMessage,
          agentReason: enqueueResult.reason ?? null,
        });
        this.logger.error(
          `post-promotion thumbnail_generate enqueue rejected (organization=${organizationId}, master=${master.id}, generation=${generation.id}): ${errorMessage}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `post-promotion thumbnail_generate failed (organization=${organizationId}, master=${master.id}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (generationId) {
        await this.markThumbnailFailed({
          organizationId,
          generationId,
          errorMessage: message,
          agentReason: null,
        });
      }
    }
  }

  private async ensureProductWorkspaceGroup(input: {
    organizationId: string;
    productId: string;
    title: string;
  }): Promise<{ id: string; targetMasterId: string | null }> {
    const existing = await this.prisma.contentGenerationGroup.findFirst({
      where: {
        organizationId: input.organizationId,
        groupType: 'product_workspace',
        targetMasterId: input.productId,
      },
      select: { id: true, targetMasterId: true },
    });
    if (existing) return existing;

    try {
      return await this.prisma.contentGenerationGroup.create({
        data: {
          organizationId: input.organizationId,
          groupType: 'product_workspace',
          targetMasterId: input.productId,
          title: input.title.slice(0, 80),
          createdByUserId: null,
          metadata: { source: 'post_promotion' },
        },
        select: { id: true, targetMasterId: true },
      });
    } catch (error) {
      const raced = await this.prisma.contentGenerationGroup.findFirst({
        where: {
          organizationId: input.organizationId,
          groupType: 'product_workspace',
          targetMasterId: input.productId,
        },
        select: { id: true, targetMasterId: true },
      });
      if (raced) return raced;
      throw error;
    }
  }

  private async markDetailPageFailed(input: {
    organizationId: string;
    contentGenerationId: string;
    errorMessage: string;
    agentReason: string | null;
  }): Promise<void> {
    const { organizationId, contentGenerationId, errorMessage, agentReason } = input;
    try {
      await this.prisma.contentGeneration.updateMany({
        where: { id: contentGenerationId, organizationId },
        data: { status: 'FAILED', errorMessage },
      });
    } catch (err) {
      this.logger.warn(
        `post-promotion detail_page_generate FAILED row update failed (contentGeneration=${contentGenerationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    try {
      await this.operationAlerts.fail(
        organizationId,
        detailPageOperationKey(contentGenerationId),
        {
          message: errorMessage,
          metadata: {
            errorCode: 'agent_enqueue_failed',
            agentReason,
          },
        },
      );
    } catch (err) {
      this.logger.warn(
        `post-promotion detail_page_generate alert.fail failed (contentGeneration=${contentGenerationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async markThumbnailFailed(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
    agentReason: string | null;
  }): Promise<void> {
    const { organizationId, generationId, errorMessage, agentReason } = input;
    try {
      await this.prisma.thumbnailGeneration.updateMany({
        where: { id: generationId, organizationId },
        data: { status: 'failed', phase: null, errorMessage },
      });
    } catch (err) {
      this.logger.warn(
        `post-promotion thumbnail_generate failed row update failed (generation=${generationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    try {
      await this.operationAlerts.fail(
        organizationId,
        this.thumbnailOperationKey(generationId),
        {
          message: errorMessage,
          metadata: {
            errorCode: 'agent_enqueue_failed',
            agentReason,
          },
        },
      );
    } catch (err) {
      this.logger.warn(
        `post-promotion thumbnail_generate alert.fail failed (generation=${generationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private thumbnailOperationKey(generationId: string): string {
    return `thumbnail-edit:${generationId}`;
  }

  private thumbnailGenerationHref(generationId: string): string {
    return `/product-pipeline/thumbnail-generation?generationId=${encodeURIComponent(generationId)}`;
  }
}
