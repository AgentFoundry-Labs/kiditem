import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentObservabilityService } from '../../../agent-os/application/service/agent-observability.service';
import {
  THUMBNAIL_GENERATE_AGENT_TYPE,
  ThumbnailGenerateAgentOutputSchema,
} from '../../domain/agent-output';
import {
  THUMBNAIL_AGENT_OUTPUT_SINK_PORT,
  type ThumbnailAgentOutputSinkPort,
} from '../port/out/thumbnail-agent-output-sink.port';

export interface ThumbnailReconcileSummary {
  scanned: number;
  appliedSuccess: number;
  appliedFailure: number;
  skipped: number;
}

interface ReconcileOptions {
  /** Default: 60 minutes. Only consider requests finished after this many minutes ago. */
  sinceMinutes?: number;
  /** Default: 50. Cap per call. */
  limit?: number;
}

/**
 * Reconcile worker for the thumbnail editor Agent OS pipeline.
 *
 * Mirrors `DetailPageAgentReconcileService` for the
 * `thumbnail_generate` agent type. The bus event is hot-path only; if a
 * listener crashes or the process restarts between
 * `repository.finalizeRun(...)` and the sink, the originating
 * `ThumbnailGeneration` row stays `pending` even though
 * `AgentRun.output` (or `AgentRunRequest.lastErrorCode`) carries the
 * durable result.
 *
 * Same boundaries as detail page:
 *   - Reads via `AgentObservabilityService.findRunByRequest` so
 *     `AGENT_OS_REPOSITORY_PORT` stays private to agent-os.
 *   - Schema-validates the output the same way the bridge does.
 *   - Honors organization scope on every read and every sink call.
 *   - Idempotent — `lockGenerationForProcessing` returns null on
 *     terminal rows so the sink is a no-op when already applied.
 */
@Injectable()
export class ThumbnailAgentReconcileService {
  private readonly logger = new Logger(ThumbnailAgentReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: AgentObservabilityService,
    @Inject(THUMBNAIL_AGENT_OUTPUT_SINK_PORT)
    private readonly sink: ThumbnailAgentOutputSinkPort,
  ) {}

  async reconcile(
    organizationId: string,
    options: ReconcileOptions = {},
  ): Promise<ThumbnailReconcileSummary> {
    if (!organizationId) {
      throw new Error(
        'ThumbnailAgentReconcileService.reconcile requires organizationId.',
      );
    }
    const sinceMinutes = options.sinceMinutes ?? 60;
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

    const summary: ThumbnailReconcileSummary = {
      scanned: 0,
      appliedSuccess: 0,
      appliedFailure: 0,
      skipped: 0,
    };

    const requests = await this.prisma.agentRunRequest.findMany({
      where: {
        organizationId,
        sourceResourceType: 'thumbnail_generation',
        source: 'ai.thumbnail_generate',
        status: { in: ['succeeded', 'failed'] },
        finishedAt: { gte: since },
      },
      orderBy: { finishedAt: 'desc' },
      take: limit,
    });

    for (const req of requests) {
      summary.scanned += 1;
      const sourceResourceId = req.sourceResourceId;
      if (!sourceResourceId) {
        summary.skipped += 1;
        continue;
      }
      const generation = await this.prisma.thumbnailGeneration.findFirst({
        where: { id: sourceResourceId, organizationId },
        select: { id: true, status: true },
      });
      if (!generation) {
        summary.skipped += 1;
        continue;
      }
      if (generation.status !== 'pending' && generation.status !== 'running') {
        // Already terminal — bridge applied or earlier reconcile run
        // already replayed.
        summary.skipped += 1;
        continue;
      }

      if (req.status === 'failed') {
        await this.sink.applyFailure({
          organizationId,
          requestId: req.id,
          runId: undefined,
          sourceResourceId,
          errorCode: req.lastErrorCode ?? 'agent_run_failed',
          errorMessage:
            req.lastErrorMessage ?? 'Agent run failed without a recorded message.',
        });
        summary.appliedFailure += 1;
        continue;
      }

      const ourRun = await this.observability.findRunByRequest({
        organizationId,
        requestId: req.id,
        status: ['succeeded'],
      });
      const output = ourRun?.output ?? null;
      const parsed = ThumbnailGenerateAgentOutputSchema.safeParse(output);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const message = issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'Agent output failed schema validation during reconcile.';
        this.logger.warn(
          `thumbnail_generate reconcile: invalid output for request=${req.id}; routing to applyFailure. ${message}`,
        );
        await this.sink.applyFailure({
          organizationId,
          requestId: req.id,
          runId: ourRun?.id,
          sourceResourceId,
          errorCode: 'agent_output_invalid',
          errorMessage: message,
        });
        summary.appliedFailure += 1;
        continue;
      }

      await this.sink.applySuccess({
        organizationId,
        requestId: req.id,
        runId: ourRun?.id,
        sourceResourceId,
        output: parsed.data,
      });
      summary.appliedSuccess += 1;
    }

    if (summary.scanned > 0) {
      this.logger.log(
        `thumbnail_generate reconcile: org=${organizationId} agentType=${THUMBNAIL_GENERATE_AGENT_TYPE} ` +
          `scanned=${summary.scanned} ok=${summary.appliedSuccess} failed=${summary.appliedFailure} skipped=${summary.skipped}.`,
      );
    }
    return summary;
  }
}
