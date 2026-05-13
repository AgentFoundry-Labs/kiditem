import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../agent-os/application/port/in/agent-runner.port';
import { OperationAlertService } from '../../../automation/application/service/operation-alert.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentAssetService } from './content-asset.service';

interface ImageEditLedger {
  id: string;
  masterId: string | null;
  generationGroupId: string | null;
}

/**
 * Image edit entry point.
 *
 * Image edits are async by design — heavy/slow work that runs through
 * Agent OS. The legacy `AgentRegistryService.runByType('image_edit', ...)`
 * call site is replaced with a direct dependency on the Agent OS
 * {@link AgentRunnerPort} (`AGENT_RUNNER_PORT`).
 *
 * The legacy `{ taskId }` HTTP contract is preserved for clients that
 * already poll on `taskId`, but the value is now the Agent OS request id.
 * Clients poll `/api/agent-os/requests/:id` and pivot to the run through
 * `latestRunId`. When the runner produces no request/run id the runner's
 * `reason` is surfaced rather than a fabricated id — the "no silent
 * fallback" rule extends to identifier invention.
 *
 * When the runner returns a durable `requestId`, this service also opens a
 * producer-owned operation Alert keyed by the same `agent_run_request` /
 * `<requestId>` pair the operation-alert bridge closes on FINALIZED. Issue
 * #207's safety-net fallback bridge becomes a backstop instead of the
 * primary signal once every Agent OS producer wires its own start() like
 * this.
 */
@Injectable()
export class ImageAiService {
  private readonly logger = new Logger(ImageAiService.name);

  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    private readonly operationAlerts: OperationAlertService,
    private readonly prisma: PrismaService,
    private readonly contentAssets: ContentAssetService,
  ) {}

  async createEditTask(
    params: {
      image_url: string;
      preset: string;
      user_prompt?: string;
      productId?: string;
      contentGenerationId?: string;
    },
    organizationId: string,
    triggeredByUserId: string | null,
  ) {
    const ledger = await this.createImageEditLedger({
      organizationId,
      triggeredByUserId,
      params,
    });

    let result: AgentRunnerResult;
    try {
      result = await this.agentRunner.runByType('image_edit', {
        organizationId,
        sourceType: 'ai.image_edit',
        ...(ledger
          ? {
              sourceResourceType: 'content_generation',
              sourceResourceId: ledger.id,
            }
          : {}),
        reason: 'image-ai edit',
        payload: {
          image_url: params.image_url,
          preset: params.preset,
          user_prompt: params.user_prompt ?? '',
          ...(params.productId ? { productId: params.productId } : {}),
          ...(params.contentGenerationId
            ? { contentGenerationId: params.contentGenerationId }
            : {}),
        },
        ...(triggeredByUserId ? { requestedByUserId: triggeredByUserId } : {}),
      });
    } catch (error) {
      if (ledger) {
        await this.markLedgerFailed(organizationId, ledger.id, error);
      }
      throw error;
    }

    let taskId: string;
    try {
      taskId = this.requireTaskId(result, 'ai.image_edit');
    } catch (error) {
      if (ledger) {
        await this.markLedgerFailed(organizationId, ledger.id, error);
      }
      throw error;
    }

    if (result.requestId) {
      await this.operationAlerts.start({
        organizationId,
        operationKey: `image-edit:${result.requestId}`,
        type: 'image_edit',
        title: '이미지 편집 진행 중',
        sourceType: 'agent_run_request',
        sourceId: result.requestId,
        actorUserId: triggeredByUserId,
        href: this.imageEditHref(ledger),
        metadata: {
          agentType: 'image_edit',
          preset: params.preset,
          contentGenerationId: ledger?.id ?? null,
        },
      });
      this.kickEnqueuedImageEditRequest({
        organizationId,
        requestId: result.requestId,
      });
    }

    return { taskId };
  }

  private async createImageEditLedger(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    params: {
      image_url: string;
      preset: string;
      productId?: string;
      contentGenerationId?: string;
    };
  }): Promise<ImageEditLedger | null> {
    const { organizationId, params } = input;
    if (!params.productId && !params.contentGenerationId) return null;

    const sourceGeneration = params.contentGenerationId
      ? await this.prisma.contentGeneration.findFirst({
          where: { id: params.contentGenerationId, organizationId },
          select: {
            id: true,
            masterId: true,
            generationGroupId: true,
            generatedTitle: true,
          },
        })
      : null;
    if (params.contentGenerationId && !sourceGeneration) {
      throw new NotFoundException('Source content generation not found');
    }

    const masterId = params.productId ?? sourceGeneration?.masterId ?? null;
    if (params.productId) {
      const master = await this.prisma.masterProduct.findFirst({
        where: { id: params.productId, organizationId, isDeleted: false },
        select: { id: true },
      });
      if (!master) throw new NotFoundException('Master product not found');
    }

    let generationGroupId = sourceGeneration?.generationGroupId ?? null;
    if (!masterId && !generationGroupId) {
      const group = await this.prisma.contentGenerationGroup.create({
        data: {
          organizationId,
          groupType: 'image_edit',
          title: '이미지 편집 작업',
          baseContentGenerationId: sourceGeneration?.id ?? null,
          createdByUserId: input.triggeredByUserId,
          metadata: { preset: params.preset },
        },
        select: { id: true },
      });
      generationGroupId = group.id;
    }

    const generation = await this.prisma.contentGeneration.create({
      data: {
        organizationId,
        masterId,
        generationGroupId,
        contentType: 'image',
        originalImages: [params.image_url] as Prisma.InputJsonValue,
        processedImages: {} as Prisma.InputJsonValue,
        generatedTitle: this.imageEditTitle(params.preset),
        status: 'PROCESSING',
        triggeredByUserId: input.triggeredByUserId,
      },
      select: { id: true, masterId: true, generationGroupId: true },
    });

    const inputAsset = await this.contentAssets.recordImageEditInputAsset({
      organizationId,
      contentGenerationId: generation.id,
      masterId,
      createdByUserId: input.triggeredByUserId,
      imageUrl: params.image_url,
    });

    const sourceRows: Prisma.ContentGenerationSourceCreateManyInput[] = [];
    if (sourceGeneration) {
      sourceRows.push({
        organizationId,
        contentGenerationId: generation.id,
        sourceType: 'content_generation',
        sourceContentGenerationId: sourceGeneration.id,
        label: sourceGeneration.generatedTitle ?? 'Source detail page',
        sortOrder: sourceRows.length,
        metadata: {},
      });
    }
    if (masterId) {
      sourceRows.push({
        organizationId,
        contentGenerationId: generation.id,
        sourceType: 'master_product',
        masterId,
        label: 'Master product',
        sortOrder: sourceRows.length,
        metadata: {},
      });
    }
    if (inputAsset) {
      sourceRows.push({
        organizationId,
        contentGenerationId: generation.id,
        sourceType: 'input_asset',
        contentAssetId: inputAsset.id,
        label: inputAsset.label ?? inputAsset.role ?? 'Input image',
        sortOrder: sourceRows.length,
        metadata: {
          originType: inputAsset.originType,
          assetKey: inputAsset.assetKey,
        },
      });
    }
    if (sourceRows.length > 0) {
      await this.prisma.contentGenerationSource.createMany({
        skipDuplicates: true,
        data: sourceRows,
      });
    }

    return generation;
  }

  private async markLedgerFailed(
    organizationId: string,
    contentGenerationId: string,
    error: unknown,
  ): Promise<void> {
    await this.prisma.contentGeneration.updateMany({
      where: {
        id: contentGenerationId,
        organizationId,
        status: 'PROCESSING',
      },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }

  private imageEditHref(ledger: ImageEditLedger | null): string {
    if (!ledger) return '/product-content?contentType=image';
    if (ledger.masterId) return `/product-content/${ledger.masterId}`;
    if (ledger.generationGroupId) return `/product-content/groups/${ledger.generationGroupId}`;
    return '/product-content?contentType=image';
  }

  private imageEditTitle(preset: string): string {
    if (preset === 'remove_background') return '배경 제거 이미지';
    if (preset === 'remove_text') return '텍스트 제거 이미지';
    if (preset === 'replace_background') return '배경 교체 이미지';
    if (preset === 'enhance') return '화질 개선 이미지';
    if (preset === 'full_regenerate') return '재생성 이미지';
    if (preset === 'color_guide') return '색상 안내 이미지';
    return '이미지 편집 결과';
  }

  private kickEnqueuedImageEditRequest(input: {
    organizationId: string;
    requestId: string;
  }): void {
    if (!this.agentRunner.executeRequest) return;

    void this.agentRunner.executeRequest({
      organizationId: input.organizationId,
      requestId: input.requestId,
      workerId: 'image-edit-inline',
    }).catch((error) => {
      this.logger.warn(
        `Failed to kick image_edit request ${input.requestId}: ${error}`,
      );
    });
  }

  private requireTaskId(result: AgentRunnerResult, sourceType: string): string {
    const taskId = result.requestId ?? result.runId;
    if (!taskId) {
      throw new InternalServerErrorException(
        `Agent OS runner returned no runId/requestId for ${sourceType}` +
          (result.reason ? ` (${result.reason})` : ''),
      );
    }
    return taskId;
  }
}
