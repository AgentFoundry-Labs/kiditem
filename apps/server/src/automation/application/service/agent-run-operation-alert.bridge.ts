import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../../../agent-os/application/event/agent-run-events';
import { OperationAlertService } from './operation-alert.service';

/**
 * AgentRunOperationAlertBridge — projects Agent OS run lifecycle into the
 * unified `Alert` ledger. Two modes:
 *
 * 1. **Close** — when a producer (rules.evaluation, rules.suggest,
 *    thumbnail edit/auto, detail-page generate, …) opened its own operation
 *    alert keyed by `sourceType='agent_run_request'` + `sourceId=<requestId>`,
 *    the bridge transitions that row to `succeeded` / `failed` on FINALIZED.
 * 2. **Fallback create** — when no producer-owned alert exists for the run,
 *    the producer either chose not to project (eg. system/cron-driven work)
 *    or never wired up an operation alert. For user-triggered failures
 *    (`requestedByUserId != null` + `status === 'failed'`), the bridge opens
 *    a synthesized operation alert here so the failure surfaces in the
 *    Alerts inbox per the Alert single-surface contract
 *    (`apps/server/src/agent-os/AGENTS.md` Data Contracts). Successful
 *    runs and system-triggered failures are intentionally not projected —
 *    Agent OS observability already owns those signals.
 *
 * The bridge is the cross-domain seam: agent-os emits a generic
 * `agent.run.finalized` event when a request reaches a terminal state and
 * automation owns the user-facing Alert ledger. No per-agent-type code
 * lives here; href fallback uses the producer-set `source` string.
 */

/**
 * Map an `AgentRunRequest.source` string to a deep link the user can act on.
 * Conservative: producers that already wire their own operation alert will
 * close-by-source above this fallback, so this mapping only fires for
 * sources that have not been migrated yet. Unknown sources fall back to
 * `/dashboard` so the user at least sees the failure in their Alert inbox.
 */
function mapSourceToHref(source: string): string {
  if (source === 'ai.image_edit') return '/image-hub';
  if (source === 'advertising.ad_strategy.manual') return '/ad-ops';
  if (source === 'sourcing.scrape_url') return '/sourcing';
  if (
    source === 'ai.thumbnail_auto_edit' ||
    source === 'ai.thumbnail_generate' ||
    source === 'thumbnail_generate'
  ) {
    return '/thumbnails';
  }
  if (source === 'rules.evaluation' || source === 'rules.suggest') {
    return '/dashboard';
  }
  return '/dashboard';
}

@Injectable()
export class AgentRunOperationAlertBridge {
  private readonly logger = new Logger(AgentRunOperationAlertBridge.name);

  constructor(private readonly operationAlerts: OperationAlertService) {}

  @OnEvent(AGENT_RUN_EVENTS.FINALIZED)
  async onAgentRunFinalized(event: AgentRunFinalizedEvent): Promise<void> {
    try {
      const metadata = event.runId === undefined ? {} : { runId: event.runId };
      const closed = await this.operationAlerts.closeBySource(
        event.organizationId,
        'agent_run_request',
        event.requestId,
        event.status,
        event.status === 'succeeded'
          ? { metadata }
          : {
              message: event.errorMessage,
              metadata: { ...metadata, errorCode: event.errorCode },
            },
      );

      if (closed) return;
      if (event.status !== 'failed') return;
      if (!event.requestedByUserId) return;

      // Fallback projection — producer never opened an operation alert but the
      // user kicked the work off and it failed. Surface it in the Alert
      // ledger so the user is not stuck waiting on a silent agent run.
      await this.createFallbackFailureAlert(event);
    } catch (err) {
      const target = event.runId === undefined
        ? `request ${event.requestId}`
        : `AgentRun ${event.runId} (request ${event.requestId})`;
      this.logger.warn(
        `closeBySource failed for ${target}: ${err}`,
      );
    }
  }

  private async createFallbackFailureAlert(
    event: AgentRunFinalizedEvent,
  ): Promise<void> {
    const operationKey = `agent_run_request:${event.requestId}`;
    const href = mapSourceToHref(event.source);
    const baseMetadata: Record<string, unknown> = {
      agentType: event.agentType,
      source: event.source,
      requestId: event.requestId,
    };
    if (event.runId) baseMetadata.runId = event.runId;
    if (event.errorCode) baseMetadata.errorCode = event.errorCode;

    await this.operationAlerts.start({
      organizationId: event.organizationId,
      operationKey,
      type: 'agent_run_failure',
      title: '에이전트 작업 실패',
      message: event.errorMessage ?? null,
      sourceType: 'agent_run_request',
      sourceId: event.requestId,
      actorUserId: event.requestedByUserId,
      href,
      severity: 'error',
      metadata: baseMetadata,
    });
    await this.operationAlerts.fail(event.organizationId, operationKey, {
      message: event.errorMessage ?? null,
      severity: 'error',
      metadata: baseMetadata,
    });
  }
}
