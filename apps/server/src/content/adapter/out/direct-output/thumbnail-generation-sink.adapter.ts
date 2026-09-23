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
 * generation output back onto the originating job: candidates become
 * `content_assets` rows (source ai) in the same transaction as `succeeded`.
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

    // 후보는 같은 트랜잭션에서 `content_assets`(source ai) 행이 되고, 요청 때 적은 입력 메타는 남긴 채 실행
    // 정보만 더한다.
    const applied = await this.lifecycle.projectDirectSuccess({
      generationId: input.sourceResourceId,
      organizationId: input.organizationId,
      candidates,
      projection: projectionMetadata(input.requestId, input.runId),
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
