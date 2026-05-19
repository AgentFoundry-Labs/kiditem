import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentObservabilityService } from '../../../agent-os/application/service/agent-observability.service';
import {
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
  DetailPageGenerateAgentOutputSchema,
} from '../../domain/agent-output';
import {
  DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT,
  type DetailPageAgentOutputSinkPort,
} from '../port/out/sink/detail-page-agent-output-sink.port';
import {
  DETAIL_PAGE_RECONCILE_REPOSITORY_PORT,
  type DetailPageReconcileRepositoryPort,
} from '../port/out/repository/detail-page-reconcile.repository.port';
import {
  AgentFinalizedOutputProjectionService,
  type AgentFinalizedOutputProjectionResult,
} from './agent-finalized-output-projection.service';

export interface DetailPageReconcileSummary {
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
 * Reconcile worker for the detail-page Agent OS pipeline.
 *
 * The bus event (`agent.run.finalized`) is hot-path only — see
 * agent-os/AGENTS.md "Recovery contract". If a listener crashes or the
 * process restarts between `repository.finalizeRun(...)` and the sink
 * call, the originating `ContentGeneration` row stays `PROCESSING`
 * forever even though `AgentRun.output` (or `AgentRunRequest.lastErrorCode`)
 * has the durable result.
 *
 * This service is the recovery path. It scans terminal
 * `AgentRunRequest` rows owned by `detail_page_generate`, finds
 * the originating `ContentGeneration` rows that are still
 * `PROCESSING`, and replays them through the same sink port the
 * bridge would have called.
 *
 * Boundaries:
 *
 *   - Reads `AgentRun.output` via the agent-os repository port — never
 *     reaches into the `agent_runs` table directly.
 *   - Schema-validates the output the same way the bridge does, so
 *     "broken AgentRun.output" produces a sink failure call (not a crash).
 *   - Honors organization scope on every read and every sink call.
 *   - Idempotent: the sink itself short-circuits when the
 *     `ContentGeneration` row is already `READY` or `FAILED`, so the
 *     reconcile worker can run as often as the operator wants without
 *     racing the live bridge path.
 */
@Injectable()
export class DetailPageAgentReconcileService {
  private readonly logger = new Logger(DetailPageAgentReconcileService.name);

  constructor(
    @Inject(DETAIL_PAGE_RECONCILE_REPOSITORY_PORT)
    private readonly repository: DetailPageReconcileRepositoryPort,
    /**
     * Cross-domain reads via the observability surface that AgentOsModule
     * already exports — keeps AGENT_OS_REPOSITORY_PORT private to agent-os
     * while letting the AI domain read terminal `AgentRun.output` for
     * recovery.
     */
    private readonly observability: AgentObservabilityService,
    @Inject(DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT)
    private readonly sink: DetailPageAgentOutputSinkPort,
    @Optional()
    @Inject(AgentFinalizedOutputProjectionService)
    private readonly finalizedOutputProjection: AgentFinalizedOutputProjectionService = new AgentFinalizedOutputProjectionService(),
  ) {}

  async reconcile(
    organizationId: string,
    options: ReconcileOptions = {},
  ): Promise<DetailPageReconcileSummary> {
    if (!organizationId) {
      throw new Error('DetailPageAgentReconcileService.reconcile requires organizationId.');
    }
    const sinceMinutes = options.sinceMinutes ?? 60;
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

    const summary: DetailPageReconcileSummary = {
      scanned: 0,
      appliedSuccess: 0,
      appliedFailure: 0,
      skipped: 0,
    };

    const requests = await this.repository.listTerminalRequests({
      organizationId,
      since,
      limit,
    });

    for (const req of requests) {
      summary.scanned += 1;
      const sourceResourceId = req.sourceResourceId;
      if (!sourceResourceId) {
        summary.skipped += 1;
        continue;
      }
      const cg = await this.repository.findContentGenerationStatus({
        organizationId,
        contentGenerationId: sourceResourceId,
      });
      if (!cg) {
        summary.skipped += 1;
        continue;
      }
      if (cg.status === 'READY' || cg.status === 'FAILED') {
        // Already terminal — bridge applied or earlier reconcile run
        // already replayed.
        summary.skipped += 1;
        continue;
      }

      if (req.status === 'failed') {
        countProjectionResult(
          summary,
          await this.finalizedOutputProjection.project({
            agentLabel: 'detail_page_generate reconcile',
            schema: DetailPageGenerateAgentOutputSchema,
            sink: this.sink,
            finalized: {
              organizationId,
              requestId: req.id,
              runId: undefined,
              sourceResourceId,
              status: 'failed',
              errorCode: req.lastErrorCode ?? 'agent_run_failed',
              errorMessage:
                req.lastErrorMessage ?? 'Agent run failed without a recorded message.',
            },
          }),
        );
        continue;
      }

      // Status === 'succeeded' — pull THIS request's run output. Using
      // `listRuns({ agentInstanceId, status: ['succeeded'], limit: 1 })`
      // would pick the latest succeeded run on the instance, not the run
      // bound to this request — which silently misclassifies older stuck
      // requests as `agent_output_invalid` whenever a newer run exists on
      // the same instance.
      const ourRun = await this.observability.findRunByRequest({
        organizationId,
        requestId: req.id,
        status: ['succeeded'],
      });
      countProjectionResult(
        summary,
        await this.finalizedOutputProjection.project({
          agentLabel: 'detail_page_generate reconcile',
          schema: DetailPageGenerateAgentOutputSchema,
          sink: this.sink,
          finalized: {
            organizationId,
            requestId: req.id,
            runId: ourRun?.id,
            sourceResourceId,
            status: 'succeeded',
            output: ourRun?.output ?? null,
          },
        }),
      );
    }

    if (summary.scanned > 0) {
      this.logger.log(
        `detail_page_generate reconcile: org=${organizationId} agentType=${DETAIL_PAGE_GENERATE_AGENT_TYPE} ` +
          `scanned=${summary.scanned} ok=${summary.appliedSuccess} failed=${summary.appliedFailure} skipped=${summary.skipped}.`,
      );
    }
    return summary;
  }
}

function countProjectionResult(
  summary: DetailPageReconcileSummary,
  result: AgentFinalizedOutputProjectionResult,
): void {
  if (result.status === 'success_applied') summary.appliedSuccess += 1;
  else if (result.status === 'failure_applied') summary.appliedFailure += 1;
  else summary.skipped += 1;
}
