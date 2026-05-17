import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';
import type { ThumbnailAgentOutputSinkPort } from '../../../application/port/out/thumbnail-agent-output-sink.port';
import type { ThumbnailGenerateAgentOutput } from '../../../domain/agent-output';
import type { ThumbnailEditorCandidate } from '../../../domain/model/thumbnail-editor';
import {
  applyAgentSuccessResult,
  lockGenerationForProcessing,
  markGenerationFailed,
} from '../prisma/thumbnail-generation.persistence';
import {
  THUMBNAIL_GENERATION_EVENT_PORT,
  type ThumbnailGenerationEventPort,
} from '../../../application/port/out/thumbnail-generation-event.port';
import { ProductGenerationAlertService } from '../../../application/service/product-generation-alert.service';
import { readProductGenerationAlertLink } from '../../../application/service/product-generation-alert-link';

/**
 * Real `ThumbnailAgentOutputSinkPort` adapter — applies a validated
 * `thumbnail_generate` runtime result back onto the originating
 * `ThumbnailGeneration` row.
 *
 * Boundary contract — the sink owns Prisma writes for thumbnail
 * generation rows after enqueue. Runtime handler
 * (`ThumbnailGenerateRuntimeHandler`) and bridge
 * (`ThumbnailAgentOutputBridge`) never call Prisma. The lock + replace
 * cycle (`lockGenerationForProcessing` → `replaceGenerationResult` /
 * `markGenerationFailed`) mirrors the legacy auto-edit cohort path so
 * panel projection (PR #214) stays consistent: the same
 * `(sourceType='thumbnail_generation', sourceId=<id>)` operation alert
 * the producer opened gets closed here.
 *
 * Organization scope — every Prisma write goes through helpers that
 * bind `organizationId` on `WHERE`. The sink never trusts
 * `sourceResourceId` alone; the IDOR boundary is the `organizationId`
 * the executor stamped from the claimed `AgentRunRequest`.
 *
 * Idempotency — `lockGenerationForProcessing` returns null if the row
 * is already terminal (`succeeded`/`failed`/`cancelled`), so
 * reconcile/replay can rerun the sink safely without double-applying.
 */
@Injectable()
export class ThumbnailGenerationSinkAdapter
  implements ThumbnailAgentOutputSinkPort
{
  private readonly logger = new Logger(ThumbnailGenerationSinkAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly operationAlerts: OperationAlertService,
    @Optional()
    @Inject(THUMBNAIL_GENERATION_EVENT_PORT)
    private readonly generationEvents: ThumbnailGenerationEventPort | null = null,
    private readonly productGenerationAlerts?: ProductGenerationAlertService,
  ) {}

  static readonly OPERATION_KEY_PREFIX = 'thumbnail-edit:';
  static readonly RESULT_HREF = (id: string) =>
    `/product-pipeline/thumbnail-generation?generationId=${encodeURIComponent(id)}`;

  async applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: ThumbnailGenerateAgentOutput;
  }): Promise<void> {
    if (!input.sourceResourceId) {
      this.logger.warn(
        `thumbnail_generate success without sourceResourceId (request=${input.requestId}); cannot apply.`,
      );
      return;
    }

    const parentLink = await this.readParentLink({
      organizationId: input.organizationId,
      generationId: input.sourceResourceId,
    });

    const lock = await lockGenerationForProcessing(
      this.prisma,
      input.sourceResourceId,
      input.organizationId,
    );
    if (!lock) {
      // Already terminal or cross-tenant — idempotent no-op.
      this.logger.debug(
        `thumbnail_generate success: row ${input.sourceResourceId} not lockable (already terminal or cross-tenant); skipping.`,
      );
      return;
    }

    const candidates: ThumbnailEditorCandidate[] = input.output.candidates.map(
      (candidate) => ({
        url: candidate.url,
        storageKey: candidate.storageKey ?? null,
        filename: candidate.filename ?? null,
        mimeType: candidate.mimeType ?? null,
        fileSize: candidate.fileSize ?? null,
      }),
    );

    // applyAgentSuccessResult preserves the input-image rows the producer
    // wrote at enqueue time — only candidates / status / phase / inputMeta
    // are owned by the async sink path. `replaceGenerationResult` (used by
    // the legacy auto-batch) would delete inputs.
    const applied = await applyAgentSuccessResult(this.prisma, {
      generationId: input.sourceResourceId,
      organizationId: input.organizationId,
      candidates,
      inputMeta: {
        agentRequestId: input.requestId,
        agentRunId: input.runId ?? null,
      },
    });
    if (!applied) {
      this.logger.warn(
        `thumbnail_generate success: applyAgentSuccessResult returned null for ${input.sourceResourceId}; the row was likely cancelled mid-flight.`,
      );
      return;
    }

    await this.appendStatusEvent({
      organizationId: input.organizationId,
      generationId: input.sourceResourceId,
      eventType: 'status_change',
      fromStatus: 'running',
      toStatus: 'succeeded',
      fromPhase: applied.fromPhase,
      toPhase: 'ready',
      attemptNumber: applied.attemptNumber,
      payload: {
        agentRequestId: input.requestId,
        agentRunId: input.runId ?? null,
        candidateCount: candidates.length,
      },
    });

    if (parentLink && this.productGenerationAlerts) {
      await this.productGenerationAlerts.markChildFinished({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
        childKind: 'thumbnail',
        status: 'succeeded',
        childId: input.sourceResourceId,
      });
    } else {
      await this.operationAlerts.succeed(
        input.organizationId,
        operationKey(input.sourceResourceId),
        {
          href: ThumbnailGenerationSinkAdapter.RESULT_HREF(input.sourceResourceId),
          metadata: {
            candidateCount: candidates.length,
            agentRequestId: input.requestId,
            agentRunId: input.runId ?? null,
          },
        },
      );
    }

    this.logger.log(
      `thumbnail_generate applied success → ThumbnailGeneration ${input.sourceResourceId} succeeded (request=${input.requestId}).`,
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
        `thumbnail_generate failure without sourceResourceId (request=${input.requestId}); cannot apply.`,
      );
      return;
    }

    const parentLink = await this.readParentLink({
      organizationId: input.organizationId,
      generationId: input.sourceResourceId,
    });

    const lock = await lockGenerationForProcessing(
      this.prisma,
      input.sourceResourceId,
      input.organizationId,
    );
    if (!lock) {
      this.logger.debug(
        `thumbnail_generate failure: row ${input.sourceResourceId} not lockable; skipping.`,
      );
      return;
    }

    const failed = await markGenerationFailed(
      this.prisma,
      input.sourceResourceId,
      input.organizationId,
      input.errorMessage,
    );
    if (!failed) {
      this.logger.warn(
        `thumbnail_generate failure: markGenerationFailed returned null for ${input.sourceResourceId}.`,
      );
      return;
    }

    await this.appendStatusEvent({
      organizationId: input.organizationId,
      generationId: input.sourceResourceId,
      eventType: 'status_change',
      fromStatus: 'running',
      toStatus: 'failed',
      fromPhase: failed.fromPhase,
      toPhase: null,
      attemptNumber: failed.attemptNumber,
      errorMessage: input.errorMessage,
      payload: {
        errorCode: input.errorCode,
        agentRequestId: input.requestId,
        agentRunId: input.runId ?? null,
      },
    });

    if (parentLink && this.productGenerationAlerts) {
      await this.productGenerationAlerts.markChildFinished({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
        childKind: 'thumbnail',
        status: 'failed',
        childId: input.sourceResourceId,
        errorMessage: input.errorMessage,
      });
    } else {
      await this.operationAlerts.fail(
        input.organizationId,
        operationKey(input.sourceResourceId),
        {
          href: ThumbnailGenerationSinkAdapter.RESULT_HREF(input.sourceResourceId),
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
      `thumbnail_generate applied failure → ThumbnailGeneration ${input.sourceResourceId} failed (code=${input.errorCode} request=${input.requestId}).`,
    );
  }

  private async readParentLink(input: {
    organizationId: string;
    generationId: string;
  }) {
    const row = await this.prisma.thumbnailGeneration.findFirst({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { inputMeta: true },
    });
    return readProductGenerationAlertLink(row?.inputMeta);
  }

  private async appendStatusEvent(input: {
    organizationId: string;
    generationId: string;
    eventType: 'status_change' | 'phase_change';
    fromStatus: string | null;
    toStatus: string;
    fromPhase: string | null;
    toPhase: string | null;
    attemptNumber: number;
    errorMessage?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.generationEvents) return;
    try {
      await this.generationEvents.append({
        ...input,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      });
    } catch (err) {
      this.logger.warn(
        `thumbnail_generate event append failed (generationId=${input.generationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

function operationKey(generationId: string): string {
  return `${ThumbnailGenerationSinkAdapter.OPERATION_KEY_PREFIX}${generationId}`;
}
