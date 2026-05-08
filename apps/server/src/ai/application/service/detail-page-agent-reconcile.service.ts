import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentObservabilityService } from '../../../agent-os/application/service/agent-observability.service';
import {
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
  DetailPageGenerateAgentOutputSchema,
} from '../../domain/agent-output';
import {
  DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT,
  type DetailPageAgentOutputSinkPort,
} from '../port/out/detail-page-agent-output-sink.port';

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
    private readonly prisma: PrismaService,
    /**
     * Cross-domain reads via the observability surface that AgentOsModule
     * already exports — keeps AGENT_OS_REPOSITORY_PORT private to agent-os
     * while letting the AI domain read terminal `AgentRun.output` for
     * recovery.
     */
    private readonly observability: AgentObservabilityService,
    @Inject(DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT)
    private readonly sink: DetailPageAgentOutputSinkPort,
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

    // Cross-domain read: AgentRunRequest rows live in agent-os, but the
    // recovery contract documented in agent-os/AGENTS.md authorizes the AI
    // domain to query terminal rows for its own agentType. We use Prisma
    // here because the agent-os repository port does not expose a
    // "terminal requests by source" query, and adding one purely for AI
    // would couple agent-os to AI's recovery cadence. The query is
    // organization-scoped + agentType-scoped, so it never touches other
    // domains' rows.
    const requests = await this.prisma.agentRunRequest.findMany({
      where: {
        organizationId,
        sourceResourceType: 'content_generation',
        source: 'ai.detail_page_generate',
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
      const cg = await this.prisma.contentGeneration.findFirst({
        where: { id: sourceResourceId, organizationId },
        select: { id: true, status: true },
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

      // Status === 'succeeded' — pull the latest run's output and validate.
      const runs = await this.observability.listRuns({
        organizationId,
        limit: 1,
        agentInstanceId: req.agentInstanceId,
        status: ['succeeded'],
      });
      const ourRun = runs.find((r) => r.requestId === req.id) ?? null;
      const output = ourRun?.output ?? null;
      const parsed = DetailPageGenerateAgentOutputSchema.safeParse(output);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const message = issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'Agent output failed schema validation during reconcile.';
        this.logger.warn(
          `detail_page_generate reconcile: invalid output for request=${req.id}; routing to applyFailure. ${message}`,
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
        `detail_page_generate reconcile: org=${organizationId} agentType=${DETAIL_PAGE_GENERATE_AGENT_TYPE} ` +
          `scanned=${summary.scanned} ok=${summary.appliedSuccess} failed=${summary.appliedFailure} skipped=${summary.skipped}.`,
      );
    }
    return summary;
  }
}
