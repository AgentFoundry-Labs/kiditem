import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { DetailPageDirectOutputSinkPort } from '../../../application/port/out/sink/detail-page-direct-output-sink.port';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../application/port/out/cross-domain/operation-alert.port';
import type { DetailPageGenerateDirectOutput } from '../../../domain/direct-generation';
import { DetailPageGeneratedImagesService } from '../../../application/service/detail-page-generated-images.service';
import {
  type DetailPageStoredJson,
  detailPageOperationKey,
  toDetailPageStoredJson,
} from '../../../application/service/detail-page-stored.helpers';
import { ContentAssetService } from '../../../application/service/content-asset.service';
import { ProductGenerationAlertService } from '../../../application/service/product-generation-alert.service';
import { readProductGenerationAlertLink } from '../../../application/service/product-generation-alert-link';

const TERMINAL_CONTENT_GENERATION_STATUSES = new Set([
  'READY',
  'FAILED',
  'CANCELLED',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Real `DetailPageDirectOutputSinkPort` adapter — applies validated
 * detail-page generation output back onto the originating `ContentGeneration`
 * row.
 *
 * Boundary contract — the sink is the only piece on the AI side that owns
 * Prisma writes for ContentGeneration after enqueue. Direct jobs perform
 * provider/media work and call this sink with validated output; the sink only
 * projects that output into domain tables.
 *
 * Organization scope — every Prisma write goes through `findFirst({ id,
 * organizationId })` + `updateMany({ id, organizationId })`. The sink
 * never trusts `sourceResourceId` alone; the IDOR boundary is the
 * server-resolved `organizationId` passed by the direct job.
 *
 * Recovery — the row remains `PROCESSING` only while the direct job is
 * running. Cancellation and retirement migrations move abandoned historical
 * rows to terminal states instead of replaying legacy requests.
 */
@Injectable()
export class DetailPageContentGenerationSinkAdapter
  implements DetailPageDirectOutputSinkPort
{
  private readonly logger = new Logger(
    DetailPageContentGenerationSinkAdapter.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    private readonly _generatedImages: DetailPageGeneratedImagesService,
    private readonly contentAssets: ContentAssetService,
    private readonly productGenerationAlerts: ProductGenerationAlertService,
  ) {}

  async applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: DetailPageGenerateDirectOutput;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.warn(
        `detail_page_generate success without sourceResourceId (request=${input.requestId}); cannot apply.`,
      );
      return;
    }

    const row = await this.prisma.contentGeneration.findFirst({
      where: { id: input.sourceResourceId, organizationId: input.organizationId },
    });
    if (!row) {
      this.logger.warn(
        `detail_page_generate success: ContentGeneration ${input.sourceResourceId} not found in organization ${input.organizationId}.`,
      );
      return;
    }
    if (TERMINAL_CONTENT_GENERATION_STATUSES.has(row.status)) {
      // Idempotent: a retried direct job or cancellation already made the row terminal.
      this.logger.debug(
        `detail_page_generate success: ContentGeneration ${row.id} already terminal (${row.status}); no-op.`,
      );
      return;
    }

    const parentLink = readProductGenerationAlertLink(row.generationInput);
    if (
      parentLink &&
      await this.isParentOperationCancelled({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
      })
    ) {
      this.logger.debug(
        `detail_page_generate ${row.id}: parent operation ${parentLink.parentOperationKey} cancelled; no-op.`,
      );
      return;
    }

    const stored = toDetailPageStoredJson({
      templateId: input.output.templateId,
      generationInput: row.generationInput,
      generationResult: row.generationResult,
    });
    const productName = pickProductName(
      input.output.result,
      input.output.templateId,
      stored.rawTitle ?? row.generatedTitle ?? '상세페이지',
    );

    const processedImages = input.output.processedImages ?? {};

    const applied = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.contentGeneration.updateMany({
        where: {
          id: row.id,
          organizationId: input.organizationId,
          status: 'PROCESSING',
        },
        data: { status: 'APPLYING' },
      });
      if (claimed.count === 0) return null;

      const artifact = row.detailPageArtifactId
        ? await tx.detailPageArtifact.findFirstOrThrow({
            where: {
              id: row.detailPageArtifactId,
              organizationId: input.organizationId,
            },
            select: { id: true },
          })
        : await tx.detailPageArtifact.create({
            data: {
              organizationId: input.organizationId,
              contentWorkspaceId: row.contentWorkspaceId,
              sourceContentGenerationId: row.id,
              title: productName,
              status: 'generated',
              createdByUserId: row.triggeredByUserId,
              metadata: {
                source: 'detail_page_generation_success',
                ...projectionMetadata(input.requestId, input.runId),
              },
            },
            select: { id: true },
          });

      if (Object.keys(processedImages).length > 0) {
        await this.contentAssets.recordDetailPageGeneratedAssetsTx(tx, {
          organizationId: input.organizationId,
          contentGenerationId: row.id,
          generationGroupId: row.generationGroupId,
          processedImages,
        });
      }

      await tx.contentWorkspace.updateMany({
        where: {
          id: row.contentWorkspaceId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: {
          currentDetailPageArtifactId: artifact.id,
          status: 'active',
        },
      });

      const finalized = await tx.contentGeneration.updateMany({
        where: {
          id: row.id,
          organizationId: input.organizationId,
          status: 'APPLYING',
        },
        data: {
          detailPageArtifactId: artifact.id,
          generatedTitle: productName,
          generationResult: {
            templateId: input.output.templateId,
            result: input.output.result,
            imageUrls: input.output.imageUrls,
            processedImages,
          } as Prisma.InputJsonValue,
          status: 'READY',
          errorMessage: null,
        },
      });
      if (finalized.count !== 1) {
        throw new Error(
          `detail_page_generate ${row.id}: APPLYING claim was lost before finalize`,
        );
      }
      return { artifactId: artifact.id };
    });
    if (!applied) {
      this.logger.debug(
        `detail_page_generate success: ContentGeneration ${row.id} became terminal before apply; no-op.`,
      );
      return;
    }

    if (parentLink) {
      await this.productGenerationAlerts.markChildFinished({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
        childKind: 'detail_page',
        status: 'succeeded',
        childId: row.id,
      });
    } else {
      await this.operationAlerts.succeed(
        input.organizationId,
        detailPageOperationKey(row.id),
        {
          metadata: {
            generatedTitle: productName,
            heroImageCount: Object.keys(processedImages).length,
            ...projectionMetadata(input.requestId, input.runId),
          },
        },
      );
    }

    this.logger.log(
      `detail_page_generate applied success → ContentGeneration ${row.id} READY (request=${input.requestId}).`,
    );
  }

  async applyFailure(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.warn(
        `detail_page_generate failure without sourceResourceId (request=${input.requestId}); cannot apply.`,
      );
      return;
    }

    const row = await this.prisma.contentGeneration.findFirst({
      where: { id: input.sourceResourceId, organizationId: input.organizationId },
      select: { id: true, status: true, generationInput: true },
    });
    if (!row) {
      this.logger.warn(
        `detail_page_generate failure: ContentGeneration ${input.sourceResourceId} not found in organization ${input.organizationId}.`,
      );
      return;
    }
    if (TERMINAL_CONTENT_GENERATION_STATUSES.has(row.status)) {
      this.logger.debug(
        `detail_page_generate failure: ContentGeneration ${row.id} already terminal (${row.status}); no-op.`,
      );
      return;
    }

    const parentLink = readProductGenerationAlertLink(row.generationInput);
    if (
      parentLink &&
      await this.isParentOperationCancelled({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
      })
    ) {
      this.logger.debug(
        `detail_page_generate ${row.id}: parent operation ${parentLink.parentOperationKey} cancelled; no-op.`,
      );
      return;
    }

    const updated = await this.prisma.contentGeneration.updateMany({
      where: {
        id: row.id,
        organizationId: input.organizationId,
        status: { notIn: [...TERMINAL_CONTENT_GENERATION_STATUSES] },
      },
      data: {
        status: 'FAILED',
        errorMessage: input.errorMessage,
      },
    });
    if (updated.count === 0) {
      this.logger.debug(
        `detail_page_generate failure: ContentGeneration ${row.id} became terminal before apply; no-op.`,
      );
      return;
    }

    if (parentLink) {
      await this.productGenerationAlerts.markChildFinished({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
        childKind: 'detail_page',
        status: 'failed',
        childId: row.id,
        errorMessage: input.errorMessage,
      });
    } else {
      await this.operationAlerts.fail(
        input.organizationId,
        detailPageOperationKey(row.id),
        {
          message: input.errorMessage,
          metadata: {
            errorCode: input.errorCode,
            ...projectionMetadata(input.requestId, input.runId),
          },
        },
      );
    }

    this.logger.log(
      `detail_page_generate applied failure → ContentGeneration ${row.id} FAILED (code=${input.errorCode} request=${input.requestId}).`,
    );
  }

  private async isParentOperationCancelled(input: {
    organizationId: string;
    parentOperationKey: string;
  }): Promise<boolean> {
    if (typeof this.operationAlerts.findByOperationKey !== 'function') {
      return false;
    }
    const alert = await this.operationAlerts.findByOperationKey(
      input.organizationId,
      input.parentOperationKey,
    );
    return alert?.status === 'cancelled';
  }

}

function projectionMetadata(
  requestId: string,
  runId: string | undefined,
): Record<string, unknown> {
  if (requestId.startsWith('direct-ai:')) {
    return {
      executionMode: 'direct_ai',
      aiJobId: requestId,
    };
  }
  return {
    executionMode: 'agent_os',
    aiJobId: requestId,
    agentRunId: runId ?? null,
  };
}

function pickProductName(
  parsed: unknown,
  templateId: 'kids-playful' | 'bold-vertical',
  fallback: string,
): string {
  if (templateId === 'bold-vertical') {
    const hookText = (parsed as { hook?: { text?: unknown } }).hook?.text;
    const hookTitleSub = (parsed as { hook?: { titleSub?: unknown } }).hook
      ?.titleSub;
    const title = [
      typeof hookText === 'string' ? hookText.trim() : '',
      typeof hookTitleSub === 'string' ? hookTitleSub.trim() : '',
    ]
      .filter(Boolean)
      .join(' ');
    return title || fallback.slice(0, 50);
  }
  const headline = (parsed as { section1?: { mainHeadline?: unknown } }).section1
    ?.mainHeadline;
  return typeof headline === 'string' && headline.trim()
    ? headline.trim()
    : fallback.slice(0, 50);
}
