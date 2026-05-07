import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../../../agent-os/application/event/agent-run-events';
import { OperationAlertService } from './operation-alert.service';

/**
 * AgentRunOperationAlertBridge — closes operation alerts when the upstream
 * AgentRun finalizes.
 *
 * Producers that delegate to Agent OS (rules.evaluation, rules.suggest, …)
 * open an operation alert keyed by `sourceType='agent_run_request'` +
 * `sourceId=<requestId>`. Without this bridge those alerts would stay
 * `running` forever — `AgentRunExecutor` was the only place that knew the
 * run reached a terminal state, and it had no awareness of per-domain ledger
 * entries.
 *
 * The bridge is the cross-domain seam: agent-os emits a generic
 * `agent.run.finalized` event, automation listens, and `OperationAlertService`
 * closes the row by `(sourceType, sourceId)`. Domains opt in by setting that
 * source on their alert; no per-agent-type code lives here.
 */
@Injectable()
export class AgentRunOperationAlertBridge {
  private readonly logger = new Logger(AgentRunOperationAlertBridge.name);

  constructor(private readonly operationAlerts: OperationAlertService) {}

  @OnEvent(AGENT_RUN_EVENTS.FINALIZED)
  async onAgentRunFinalized(event: AgentRunFinalizedEvent): Promise<void> {
    try {
      if (event.status === 'succeeded') {
        await this.operationAlerts.closeBySource(
          event.organizationId,
          'agent_run_request',
          event.requestId,
          'succeeded',
          { metadata: { runId: event.runId } },
        );
      } else {
        await this.operationAlerts.closeBySource(
          event.organizationId,
          'agent_run_request',
          event.requestId,
          'failed',
          {
            message: event.errorMessage,
            metadata: { runId: event.runId, errorCode: event.errorCode },
          },
        );
      }
    } catch (err) {
      this.logger.warn(
        `closeBySource failed for AgentRun ${event.runId} (request ${event.requestId}): ${err}`,
      );
    }
  }
}
