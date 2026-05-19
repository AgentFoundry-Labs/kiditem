import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentObservabilityService } from '../../../agent-os/application/service/agent-observability.service';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/operation-alert.port';
import {
  THUMBNAIL_GENERATE_AGENT_TYPE,
  ThumbnailGenerateAgentOutputSchema,
} from '../../domain/agent-output';
import {
  THUMBNAIL_AGENT_OUTPUT_SINK_PORT,
  type ThumbnailAgentOutputSinkPort,
} from '../port/out/thumbnail-agent-output-sink.port';
import {
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  type ThumbnailGenerationLedgerRepositoryPort,
} from '../port/out/thumbnail-generation-ledger.repository.port';
import {
  AgentFinalizedOutputProjectionService,
  type AgentFinalizedOutputProjectionResult,
} from './agent-finalized-output-projection.service';

export interface ThumbnailReconcileSummary {
  scanned: number;
  appliedSuccess: number;
  appliedFailure: number;
  skipped: number;
  closedTerminalAlerts: number;
  failedStale: number;
}

interface ReconcileOptions {
  /** Default: 24 hours. Only consider recently updated/finished rows. */
  sinceMinutes?: number;
  /** Default: 6 hours. Non-terminal generations older than this are failed. */
  stalePendingMinutes?: number;
  /** Default: 50. Cap per call. */
  limit?: number;
}

const DEFAULT_SINCE_MINUTES = 24 * 60;
const DEFAULT_STALE_PENDING_MINUTES = 6 * 60;
const THUMBNAIL_GENERATION_SOURCE_TYPE = 'thumbnail_generation';

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
    @Inject(THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT)
    private readonly generations: ThumbnailGenerationLedgerRepositoryPort,
    private readonly observability: AgentObservabilityService,
    @Inject(THUMBNAIL_AGENT_OUTPUT_SINK_PORT)
    private readonly sink: ThumbnailAgentOutputSinkPort,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    @Optional()
    @Inject(AgentFinalizedOutputProjectionService)
    private readonly finalizedOutputProjection: AgentFinalizedOutputProjectionService = new AgentFinalizedOutputProjectionService(),
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
    const sinceMinutes = options.sinceMinutes ?? DEFAULT_SINCE_MINUTES;
    const stalePendingMinutes =
      options.stalePendingMinutes ?? DEFAULT_STALE_PENDING_MINUTES;
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    const staleBefore = new Date(Date.now() - stalePendingMinutes * 60 * 1000);

    const summary: ThumbnailReconcileSummary = {
      scanned: 0,
      appliedSuccess: 0,
      appliedFailure: 0,
      skipped: 0,
      closedTerminalAlerts: 0,
      failedStale: 0,
    };

    const requests = await this.generations.findTerminalAgentRequests({
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
      const generation = await this.generations.findGenerationProjectionStatus({
        organizationId,
        generationId: sourceResourceId,
      });
      if (!generation) {
        summary.skipped += 1;
        continue;
      }
      if (generation.status !== 'pending' && generation.status !== 'running') {
        const closed = await this.closeOperationAlertForTerminalGeneration(
          organizationId,
          generation,
        );
        if (closed) summary.closedTerminalAlerts += 1;
        // Already terminal — bridge applied or earlier reconcile run already
        // replayed. Reconcile still closes stale operation alerts that missed
        // the final lifecycle update.
        summary.skipped += 1;
        continue;
      }

      if (req.status === 'failed') {
        countProjectionResult(
          summary,
          await this.finalizedOutputProjection.project({
            agentLabel: 'thumbnail_generate reconcile',
            schema: ThumbnailGenerateAgentOutputSchema,
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

      const ourRun = await this.observability.findRunByRequest({
        organizationId,
        requestId: req.id,
        status: ['succeeded'],
      });
      countProjectionResult(
        summary,
        await this.finalizedOutputProjection.project({
          agentLabel: 'thumbnail_generate reconcile',
          schema: ThumbnailGenerateAgentOutputSchema,
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

    summary.closedTerminalAlerts += await this.closeRecentlyTerminalAlerts(
      organizationId,
      since,
      limit,
    );
    summary.failedStale += await this.failStaleNonTerminalGenerations(
      organizationId,
      staleBefore,
      limit,
    );

    if (
      summary.scanned > 0 ||
      summary.closedTerminalAlerts > 0 ||
      summary.failedStale > 0
    ) {
      this.logger.log(
        `thumbnail_generate reconcile: org=${organizationId} agentType=${THUMBNAIL_GENERATE_AGENT_TYPE} ` +
          `scanned=${summary.scanned} ok=${summary.appliedSuccess} failed=${summary.appliedFailure} ` +
          `skipped=${summary.skipped} closedAlerts=${summary.closedTerminalAlerts} staleFailed=${summary.failedStale}.`,
      );
    }
    return summary;
  }

  private async closeRecentlyTerminalAlerts(
    organizationId: string,
    since: Date,
    limit: number,
  ): Promise<number> {
    const terminalGenerations = await this.generations.findRecentlyTerminalGenerations({
      organizationId,
      since,
      limit,
    });

    let closed = 0;
    for (const generation of terminalGenerations) {
      if (await this.closeOperationAlertForTerminalGeneration(organizationId, generation)) {
        closed += 1;
      }
    }
    return closed;
  }

  private async failStaleNonTerminalGenerations(
    organizationId: string,
    staleBefore: Date,
    limit: number,
  ): Promise<number> {
    const staleGenerations = await this.generations.findStaleNonTerminalGenerations({
      organizationId,
      staleBefore,
      limit,
    });

    let failed = 0;
    for (const generation of staleGenerations) {
      await this.finalizedOutputProjection.project({
        agentLabel: 'thumbnail_generate stale reconcile',
        schema: ThumbnailGenerateAgentOutputSchema,
        sink: this.sink,
        finalized: {
          organizationId,
          requestId: `stale:${generation.id}`,
          runId: undefined,
          sourceResourceId: generation.id,
          status: 'failed',
          errorCode: 'thumbnail_generation_stale',
          errorMessage:
            '썸네일 생성 작업이 오래 응답하지 않아 실패 처리되었습니다. 다시 생성해주세요.',
        },
      });
      failed += 1;
    }
    return failed;
  }

  private async closeOperationAlertForTerminalGeneration(
    organizationId: string,
    generation: { id: string; status: string; errorMessage: string | null },
  ): Promise<boolean> {
    const status = operationAlertStatusForGeneration(generation.status);
    if (!status) return false;
    const alert = await this.operationAlerts.closeBySource(
      organizationId,
      THUMBNAIL_GENERATION_SOURCE_TYPE,
      generation.id,
      status,
      {
        href: `/product-pipeline/thumbnail-generation?generationId=${encodeURIComponent(generation.id)}`,
        message:
          status === 'failed'
            ? generation.errorMessage ?? '썸네일 생성이 실패했습니다.'
            : null,
        metadata: {
          reconcileSource: 'thumbnail_generation_terminal_row',
          generationStatus: generation.status,
          staleReconciled: true,
        },
      },
    );
    return alert !== null;
  }
}

function operationAlertStatusForGeneration(
  status: string,
): 'succeeded' | 'failed' | 'cancelled' | null {
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'succeeded' || status === 'applied' || status === 'skipped') {
    return 'succeeded';
  }
  return null;
}

function countProjectionResult(
  summary: ThumbnailReconcileSummary,
  result: AgentFinalizedOutputProjectionResult,
): void {
  if (result.status === 'success_applied') summary.appliedSuccess += 1;
  else if (result.status === 'failure_applied') summary.appliedFailure += 1;
  else summary.skipped += 1;
}
