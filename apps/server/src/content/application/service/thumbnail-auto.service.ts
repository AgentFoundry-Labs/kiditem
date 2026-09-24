import { Injectable } from '@nestjs/common';
import { ThumbnailGenerationService } from './thumbnail-generation.service';

type AutoBatchResult = Awaited<ReturnType<ThumbnailGenerationService['createAutoBatch']>>;

/**
 * A-grade thumbnail auto re-edit cohort entrypoint.
 *
 * This is an automation batch, not an Agent OS runtime definition. The batch
 * opens per-generation operation alerts and schedules thumbnail edit jobs
 * through `ThumbnailGenerationService`.
 */
@Injectable()
export class ThumbnailAutoService {
  constructor(
    private readonly generationService: ThumbnailGenerationService,
  ) {}

  async runBatch(
    organizationId: string,
    triggeredByUserId: string | null,
    limit = 30,
  ): Promise<AutoBatchResult> {
    // No cohort-level alert here. The previous implementation marked a cohort
    // alert as `succeeded` immediately after `createAutoBatch()`, which only
    // schedules each edit through the durable direct-job worker — the actual work is
    // still running or could later fail. Users saw a misleading "completed"
    // banner. Per-generation operation alerts (now created for every method,
    // including `auto`) are the source of truth for completion. This is an
    // automation batch, not an Agent OS runtime definition.
    return this.generationService.createAutoBatch(
      organizationId,
      limit,
      triggeredByUserId,
    );
  }
}
