import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';
import type { DetailPageAgentOutputSinkPort } from '../../../application/port/out/detail-page-agent-output-sink.port';
import type { DetailPageGenerateAgentOutput } from '../../../domain/agent-output';
import type { BoldVerticalGeneration } from '../../../domain/prompts/bold-vertical/single-call';
import type { DetailPageGeneration } from '../../../domain/prompts/detail-page/single-call';
import { DetailPageGeneratedImagesService } from '../../../application/service/detail-page-generated-images.service';
import {
  detailPageOperationKey,
  normalizeStoredDetailPageRawInput,
  parseDetailPageStoredJson,
  serializeDetailPageStoredJson,
} from '../../../application/service/detail-page-stored.helpers';

const TERMINAL_CONTENT_GENERATION_STATUSES = new Set([
  'READY',
  'FAILED',
  'CANCELLED',
  'completed',
  'failed',
  'cancelled',
]);
// This wraps the whole best-effort media phase, not a single provider call.
// Gemini image generation can legitimately take longer than 30s per image, so
// keep this as a last-resort stall guard.
const GENERATED_IMAGE_TIMEOUT_MS = 15 * 60_000;

/**
 * Real `DetailPageAgentOutputSinkPort` adapter — applies a validated
 * `detail_page_generate` runtime result back onto the originating
 * `ContentGeneration` row.
 *
 * Boundary contract — the sink is the only piece on the AI side that owns
 * Prisma writes for ContentGeneration after enqueue. The runtime handler
 * (`DetailPageGenerateRuntimeHandler`) and the bridge
 * (`DetailPageAgentOutputBridge`) never call Prisma. Image generation
 * (`DetailPageGeneratedImagesService.generateBestEffort`) lives here too
 * because it needs the validated parse output and the bound storage port,
 * neither of which the runtime adapter contract exposes.
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
    private readonly generatedImages: DetailPageGeneratedImagesService,
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

    const stored = parseDetailPageStoredJson(row.detailPageHtml);
    const productName = pickProductName(
      input.output.result,
      input.output.templateId,
      stored.rawTitle ?? row.generatedTitle ?? '상세페이지',
    );

    const processedImages = await this.runImageGenerationBestEffortWithTimeout({
      organizationId: input.organizationId,
      output: input.output,
      productName,
      stored,
      timeoutMs: GENERATED_IMAGE_TIMEOUT_MS,
    });

    const detailPageHtml = serializeDetailPageStoredJson({
      templateId: input.output.templateId,
      result: input.output.result,
      imageUrls: input.output.imageUrls,
      rawInput: stored.rawInput,
    });

    const updated = await this.prisma.contentGeneration.updateMany({
      where: {
        id: row.id,
        organizationId: input.organizationId,
        status: { notIn: [...TERMINAL_CONTENT_GENERATION_STATUSES] },
      },
      data: {
        generatedTitle: productName,
        detailPageHtml,
        processedImages: processedImages as Prisma.InputJsonValue,
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
      select: { id: true, status: true },
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

    this.logger.log(
      `detail_page_generate applied failure → ContentGeneration ${row.id} FAILED (code=${input.errorCode} request=${input.requestId}).`,
    );
  }

  private async runImageGenerationBestEffortWithTimeout(input: {
    organizationId: string;
    output: DetailPageGenerateAgentOutput;
    productName: string;
    stored: ReturnType<typeof parseDetailPageStoredJson>;
    timeoutMs: number;
  }): Promise<Record<string, string>> {
    const rawInputForImages = normalizeStoredDetailPageRawInput({
      stored: input.stored,
      imageUrls: input.output.imageUrls,
      templateId: input.output.templateId,
      productName: input.productName,
    });

    const excludedImageIndices = collectExcludedImageIndices(input.output);

    try {
      return await withTimeout(
        this.generatedImages.generateBestEffort({
          organizationId: input.organizationId,
          parsed: input.output.result as DetailPageGeneration | BoldVerticalGeneration,
          templateId: input.output.templateId,
          rawInput: rawInputForImages,
          productName: input.productName,
          excludedImageIndices,
        }),
        input.timeoutMs,
        'detail_page_generate generated image best-effort timeout',
      );
    } catch (err) {
      this.logger.warn(
        `detail_page_generate image generation skipped (request resource ${input.stored.imageUrls.length} imageUrls); ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {};
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${message} after ${timeoutMs}ms`)),
          timeoutMs,
        );
        if (typeof timeout === 'object' && typeof timeout.unref === 'function') {
          timeout.unref();
        }
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
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

function collectExcludedImageIndices(
  output: DetailPageGenerateAgentOutput,
): number[] {
  const indices = new Set<number>();
  if (output.templateId === 'kids-playful') {
    for (const idx of output.reservedPackageImageIndices ?? []) {
      if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
    }
    for (const idx of output.safetyLabelImageIndices ?? []) {
      if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
    }
    return Array.from(indices).sort((a, b) => a - b);
  }
  const result = output.result as BoldVerticalGeneration;
  for (const idx of result.packageImageIndices ?? []) {
    if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
  }
  for (const idx of result.safetyLabelImageIndices ?? []) {
    if (Number.isInteger(idx) && idx >= 0) indices.add(idx);
  }
  return Array.from(indices).sort((a, b) => a - b);
}
