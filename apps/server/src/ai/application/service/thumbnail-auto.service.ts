import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../agent-os/application/port/in/agent-runner.port';
import { ThumbnailGenerationService } from './thumbnail-generation.service';

const AGENT_TYPE = 'thumbnail_auto_edit';

type AutoBatchResult = Awaited<ReturnType<ThumbnailGenerationService['createAutoBatch']>>;

/**
 * A-grade thumbnail auto re-edit cohort entrypoint.
 *
 * Legacy (pre-Agent-OS-v2) implementation owned its own `AgentDefinition`
 * upsert, opened a `HeartbeatRun`, ran the batch synchronously, and closed
 * the `HeartbeatRun`. Those Prisma models are gone.
 *
 * Agent OS v2 owns durable run accounting end-to-end (request inbox →
 * `AgentRun` → run events). We delegate via {@link AgentRunnerPort} so the
 * Agent OS catalog/run history is the single source of truth, then run the
 * inline batch work — the actual business logic still belongs to the AI
 * domain. The returned `runId` (or `requestId` if the runner deferred) is
 * surfaced so HTTP callers can correlate with the Agent OS run timeline.
 *
 * If the runner returns no run/request id (e.g. agent instance is
 * `paused`/`disabled`), we surface its `reason` instead of fabricating an
 * id — silent fallback rule.
 */
@Injectable()
export class ThumbnailAutoService {
  private readonly logger = new Logger(ThumbnailAutoService.name);

  constructor(
    private readonly generationService: ThumbnailGenerationService,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
  ) {}

  async runBatch(
    organizationId: string,
    triggeredByUserId: string | null,
    limit = 30,
  ): Promise<AutoBatchResult & { requestId?: string; runId?: string; status?: string }> {
    // No cohort-level alert here. The previous implementation marked a cohort
    // alert as `succeeded` immediately after `createAutoBatch()`, which only
    // performs `setImmediate(processEditJob)` per job — the actual work was
    // still running or could later fail. Users saw a misleading "completed"
    // banner. Per-generation operation alerts (now created for every method,
    // including `auto`) are the source of truth for completion. The cohort
    // identity is captured by the AgentRunRequest itself.
    const runner = await this.agentRunner.runByType(AGENT_TYPE, {
      organizationId,
      sourceType: 'ai.thumbnail_auto_edit',
      reason: `thumbnail-auto batch limit=${limit}`,
      payload: { limit, triggeredByUserId },
      ...(triggeredByUserId ? { requestedByUserId: triggeredByUserId } : {}),
    });

    this.requireRunnerOk(runner, 'ai.thumbnail_auto_edit');

    const result = await this.generationService.createAutoBatch(
      organizationId,
      limit,
      triggeredByUserId,
    );

    return {
      ...result,
      requestId: runner.requestId,
      runId: runner.runId,
      status: runner.status,
    };
  }

  /**
   * Refuse to invent a request/run id. If the Agent OS runner could not
   * produce one (e.g. blueprint missing, instance disabled), we surface
   * the runner's reason rather than silently proceeding with no audit
   * trail. This keeps `runByType` results visible end-to-end.
   */
  private requireRunnerOk(result: AgentRunnerResult, sourceType: string): void {
    if (result.runId || result.requestId) return;
    throw new InternalServerErrorException(
      `Agent OS runner returned no runId/requestId for ${sourceType}` +
        (result.reason ? ` (${result.reason})` : ''),
    );
  }
}
