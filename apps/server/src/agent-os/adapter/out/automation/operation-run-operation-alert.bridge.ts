import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  formatOperationRunName,
  OperationRunIdSchema,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../../automation/application/port/in/operation-alert.port';
import {
  OPERATION_RUN_EVENTS,
  type OperationRunFinalizedEvent,
} from '../../../../operations/application/event/operation-run-events';

/** Projects committed official Operation terminals into user-facing feedback. */
@Injectable()
export class OperationRunOperationAlertBridge {
  private readonly logger = new Logger(OperationRunOperationAlertBridge.name);

  constructor(
    @Inject(OPERATION_ALERT_PORT)
    private readonly alerts: OperationAlertPort,
  ) {}

  @OnEvent(OPERATION_RUN_EVENTS.FINALIZED)
  async onOperationRunFinalized(event: OperationRunFinalizedEvent): Promise<void> {
    try {
      const sourceId = formatOperationRunName(
        OrganizationIdSchema.parse(event.organizationId),
        OperationRunIdSchema.parse(event.runId),
      );
      await this.alerts.closeBySource(
        event.organizationId,
        'operation_run',
        sourceId,
        event.status,
        event.status === 'failed' || event.status === 'attention_required'
          ? {
              message: event.errorMessage,
              metadata: event.errorCode ? { errorCode: event.errorCode } : {},
            }
          : { metadata: {} },
      );
    } catch (error) {
      this.logger.warn(`official Operation alert projection failed: ${error}`);
    }
  }
}
