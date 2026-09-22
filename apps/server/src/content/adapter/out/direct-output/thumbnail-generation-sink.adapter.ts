import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IMAGE_STORAGE_PORT,
  type ImageStoragePort,
} from '../../../application/port/out/storage/image-storage.port';
import { ThumbnailGenerationLifecycleService } from '../../../application/service/thumbnail-generation-lifecycle.service';
import type { ThumbnailDirectOutputSinkPort } from '../../../application/port/out/sink/thumbnail-direct-output-sink.port';
import type { ThumbnailGenerateDirectOutput } from '../../../domain/direct-generation';
import type { ThumbnailEditorCandidate } from '../../../domain/model/thumbnail-editor';

/**
 * Real `ThumbnailDirectOutputSinkPort` adapter — applies validated thumbnail
 * generation output back onto the originating `ThumbnailGeneration` row.
 *
 * Boundary contract — the sink owns validated output projection while the
 * lifecycle service owns the tenant-scoped row lock/write transaction. Direct
 * jobs perform provider work and call this sink with validated output.
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
    private readonly lifecycle: ThumbnailGenerationLifecycleService,
    @Inject(IMAGE_STORAGE_PORT)
    private readonly storage: ImageStoragePort,
  ) {}

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

    const candidates: ThumbnailEditorCandidate[] = input.output.candidates.map(
      (candidate) => ({
        url: candidate.storageKey
          ? this.storage.getUrl(candidate.storageKey)
          : candidate.url,
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

    this.logger.log(
      `thumbnail_generate applied failure → ThumbnailGeneration ${input.sourceResourceId} failed (code=${input.errorCode} request=${input.requestId}).`,
    );
  }
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
