import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../../automation/application/port/in/operation-alert.port';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../../../application/event/agent-run-events';

/**
 * Projects Agent OS run lifecycle into automation's operation-alert ledger.
 *
 * This bridge lives in Agent OS so the dependency direction stays one-way:
 * Agent OS may call automation-owned incoming ports, but automation never
 * imports Agent OS runtime contracts.
 */
@Injectable()
export class AgentRunOperationAlertBridge {
  private readonly logger = new Logger(AgentRunOperationAlertBridge.name);

  constructor(
    @Inject(OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  @OnEvent(AGENT_RUN_EVENTS.FINALIZED)
  async onAgentRunFinalized(event: AgentRunFinalizedEvent): Promise<void> {
    if (event.requestStatus === 'cancelled') return;
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

      await this.createFallbackFailureAlert(event);
    } catch (err) {
      const target = event.runId === undefined
        ? `request ${event.requestId}`
        : `AgentRun ${event.runId} (request ${event.requestId})`;
      this.logger.warn(`closeBySource failed for ${target}: ${err}`);
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

function mapSourceToHref(source: string): string {
  if (source === 'ai.image_edit') return '/product-pipeline/registered-products?contentType=image';
  if (source === 'advertising.ad_strategy.manual') return '/ad-ops';
  if (source === 'sourcing.scrape_url') return '/product-pipeline/collected-products';
  if (
    source === 'ai.thumbnail_generate' ||
    source === 'thumbnail_generate'
  ) {
    return '/product-pipeline/thumbnail-generation';
  }
  if (source === 'rules.evaluation' || source === 'rules.suggest') {
    return '/dashboard';
  }
  return '/dashboard';
}
