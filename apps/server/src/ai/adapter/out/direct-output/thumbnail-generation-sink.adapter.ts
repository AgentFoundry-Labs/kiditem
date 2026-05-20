import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ThumbnailDirectOutputSinkPort } from '../../../application/port/out/sink/thumbnail-direct-output-sink.port';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../application/port/out/cross-domain/operation-alert.port';
import type { ThumbnailGenerateDirectOutput } from '../../../domain/direct-generation';
import type { ThumbnailEditorCandidate } from '../../../domain/model/thumbnail-editor';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationLedgerRepositoryPort,
} from '../../../application/port/out/repository/thumbnail-generation-ledger.repository.port';
import { ProductGenerationAlertService } from '../../../application/service/product-generation-alert.service';
import { ThumbnailGenerationLifecycleService } from '../../../application/service/thumbnail-generation-lifecycle.service';

/**
 * Real `ThumbnailDirectOutputSinkPort` adapter — applies validated thumbnail
 * generation output back onto the originating `ThumbnailGeneration` row.
 *
 * Boundary contract — the sink owns validated output projection and alert
 * closure after enqueue, while `ThumbnailGenerationLedgerRepositoryPort` owns
 * the tenant-scoped row lock/write transaction. Direct jobs perform provider
 * work and call this sink with validated output.
 *
 * Organization scope — every ledger call includes `organizationId`. The sink
 * never trusts `sourceResourceId` alone; the IDOR boundary is the
 * server-resolved `organizationId` passed by the direct job.
 *
 * Idempotency — `claimForDirectProjection` returns null if the row is already
 * terminal (`succeeded`/`failed`/`cancelled`), so retries can rerun the sink
 * safely without double-applying.
 */
@Injectable()
export class ThumbnailGenerationSinkAdapter
  implements ThumbnailDirectOutputSinkPort
{
  private readonly logger = new Logger(ThumbnailGenerationSinkAdapter.name);

  constructor(
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly ledger: ThumbnailGenerationLedgerRepositoryPort,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    private readonly lifecycle: ThumbnailGenerationLifecycleService,
    @Optional()
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
    output: ThumbnailGenerateDirectOutput;
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
    if (
      parentLink &&
      await this.isParentOperationCancelled({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
      })
    ) {
      this.logger.debug(
        `thumbnail_generate ${input.sourceResourceId}: parent operation ${parentLink.parentOperationKey} cancelled; no-op.`,
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

    // applyDirectSuccessResult preserves the input-image rows the producer
    // wrote at enqueue time — only candidates / status / phase / inputMeta
    // are owned by the async sink path. `replaceGenerationResult` (used by
    // the legacy auto-batch) would delete inputs.
    const applied = await this.lifecycle.projectDirectSuccess({
      generationId: input.sourceResourceId,
      organizationId: input.organizationId,
      candidates,
      inputMeta: projectionMetadata(input.requestId, input.runId),
      payload: {
        ...projectionMetadata(input.requestId, input.runId),
        candidateCount: candidates.length,
      },
    });
    if (!applied) {
      this.logger.debug(
        `thumbnail_generate success: row ${input.sourceResourceId} not lockable or no longer projectable; skipping.`,
      );
      return;
    }

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
            ...projectionMetadata(input.requestId, input.runId),
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
    if (
      parentLink &&
      await this.isParentOperationCancelled({
        organizationId: input.organizationId,
        parentOperationKey: parentLink.parentOperationKey,
      })
    ) {
      this.logger.debug(
        `thumbnail_generate ${input.sourceResourceId}: parent operation ${parentLink.parentOperationKey} cancelled; no-op.`,
      );
      return;
    }

    const failed = await this.lifecycle.projectDirectFailure({
      generationId: input.sourceResourceId,
      organizationId: input.organizationId,
      errorMessage: input.errorMessage,
      payload: {
        errorCode: input.errorCode,
        ...projectionMetadata(input.requestId, input.runId),
      },
    });
    if (!failed) {
      this.logger.debug(
        `thumbnail_generate failure: row ${input.sourceResourceId} not lockable or no longer projectable; skipping.`,
      );
      return;
    }

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
            ...projectionMetadata(input.requestId, input.runId),
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
    return this.ledger.readParentAlertLink(input);
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

function operationKey(generationId: string): string {
  return `${ThumbnailGenerationSinkAdapter.OPERATION_KEY_PREFIX}${generationId}`;
}

function projectionMetadata(
  requestId: string,
  runId: string | undefined,
): Record<string, unknown> {
  void runId;
  return {
    executionMode: 'direct_ai',
    aiJobId: requestId,
  };
}
