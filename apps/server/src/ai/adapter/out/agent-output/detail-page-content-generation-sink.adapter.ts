import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';
import type { DetailPageAgentOutputSinkPort } from '../../../application/port/out/detail-page-agent-output-sink.port';
import type { DetailPageGenerateAgentOutput } from '../../../domain/agent-output';
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

interface ContentWorkspaceWriter {
  contentWorkspace: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}
/**
 * Real `DetailPageAgentOutputSinkPort` adapter — applies a validated
 * `detail_page_generate` runtime result back onto the originating
 * `ContentGeneration` row.
 *
 * Boundary contract — the sink is the only piece on the AI side that owns
 * Prisma writes for ContentGeneration after enqueue. The runtime handler
 * (`DetailPageGenerateRuntimeHandler`) and the bridge
 * (`DetailPageAgentOutputBridge`) never call Prisma. Generated image work
 * belongs to the runtime output so AgentRun remains the durable record for
 * AI/media execution; this sink only projects that output into domain tables.
 *
 * Organization scope — every Prisma write goes through `findFirst({ id,
 * organizationId })` + `updateMany({ id, organizationId })`. The sink
 * never trusts `sourceResourceId` alone; the IDOR boundary is the
 * `organizationId` from the bus event, which the executor stamped from
 * the claimed `AgentRunRequest.organizationId` (always server-resolved).
 *
 * Recovery — the sink is hot-path only. If the bridge call sequence is
 * interrupted (process restart, listener crash), the row remains in
 * `PROCESSING`. `DetailPageAgentReconcileService` replays terminal
 * `AgentRunRequest`s through the same sink methods to recover.
 */
@Injectable()
export class DetailPageContentGenerationSinkAdapter
  implements DetailPageAgentOutputSinkPort
{
  private readonly logger = new Logger(
    DetailPageContentGenerationSinkAdapter.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly operationAlerts: OperationAlertService,
    private readonly _generatedImages: DetailPageGeneratedImagesService,
    private readonly contentAssets: ContentAssetService,
    private readonly productGenerationAlerts: ProductGenerationAlertService,
  ) {}

  async applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: DetailPageGenerateAgentOutput;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.warn(
        `detail_page_generate success without sourceResourceId (request=${input.requestId}); cannot apply.`,
      );
      return;
    }

    const row = await this.prisma.contentGeneration.findFirst({
      where: { id: input.sourceResourceId, organizationId: input.organizationId },
      include: {
        generationGroup: {
          select: { targetMasterId: true },
        },
      },
    });
    if (!row) {
      this.logger.warn(
        `detail_page_generate success: ContentGeneration ${input.sourceResourceId} not found in organization ${input.organizationId}.`,
      );
      return;
    }
    if (TERMINAL_CONTENT_GENERATION_STATUSES.has(row.status)) {
      // Idempotent: the bridge re-fired or the reconcile job already applied.
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

    if (Object.keys(processedImages).length > 0) {
      await this.contentAssets.recordDetailPageGeneratedAssets({
        organizationId: input.organizationId,
        contentGenerationId: row.id,
        generationGroupId: row.generationGroupId,
        processedImages,
      });
    }

    const detailPageArtifactId = await this.ensureDetailPageArtifact({
      organizationId: input.organizationId,
      row,
      productName,
      requestId: input.requestId,
      runId: input.runId,
    });

    const updated = await this.prisma.contentGeneration.updateMany({
      where: {
        id: row.id,
        organizationId: input.organizationId,
        status: { notIn: [...TERMINAL_CONTENT_GENERATION_STATUSES] },
      },
      data: {
        detailPageArtifactId,
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
    if (updated.count === 0) {
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
            agentRequestId: input.requestId,
            agentRunId: input.runId ?? null,
          },
        },
      );
    }

    this.logger.log(
      `detail_page_generate applied success → ContentGeneration ${row.id} READY (request=${input.requestId}).`,
    );
  }

  private async ensureDetailPageArtifact(input: {
    organizationId: string;
    row: Prisma.ContentGenerationGetPayload<{
      include: { generationGroup: { select: { targetMasterId: true } } };
    }>;
    productName: string;
    requestId: string;
    runId: string | undefined;
  }): Promise<string> {
    if (input.row.detailPageArtifactId) return input.row.detailPageArtifactId;
    const contentWorkspaceId =
      (input.row as { contentWorkspaceId?: string | null }).contentWorkspaceId ?? null;

    const artifact = await this.prisma.detailPageArtifact.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId,
        sourceCandidateId: input.row.sourceCandidateId,
        targetMasterId: input.row.generationGroup.targetMasterId,
        sourceContentGenerationId: input.row.id,
        title: input.productName,
        status: 'generated',
        createdByUserId: input.row.triggeredByUserId,
        metadata: {
          source: 'detail_page_generation_success',
          agentRequestId: input.requestId,
          agentRunId: input.runId ?? null,
        },
      },
      select: { id: true },
    });
    if (contentWorkspaceId) {
      await (this.prisma as unknown as ContentWorkspaceWriter).contentWorkspace.updateMany({
        where: {
          id: contentWorkspaceId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: {
          currentDetailPageArtifactId: artifact.id,
          status: 'active',
        },
      });
    }
    return artifact.id;
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
            agentRequestId: input.requestId,
            agentRunId: input.runId ?? null,
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
