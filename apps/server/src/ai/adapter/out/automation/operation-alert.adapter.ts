import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_ALERT_PORT as AUTOMATION_OPERATION_ALERT_PORT,
  type OperationAlertPort as AutomationOperationAlertPort,
} from '../../../../automation/application/port/in/operation-alert.port';
import type {
  CloseStaleOperationAlertsInput,
  OperationAlertCloseStatus,
  OperationAlertPort,
  OperationLifecyclePatch,
  StartOperationAlertInput,
} from '../../../application/port/out/cross-domain/operation-alert.port';

@Injectable()
export class AiOperationAlertAdapter implements OperationAlertPort {
  constructor(
    @Inject(AUTOMATION_OPERATION_ALERT_PORT)
    private readonly alerts: AutomationOperationAlertPort,
  ) {}

  start(input: StartOperationAlertInput) {
    return this.alerts.start(input);
  }

  findByOperationKey(organizationId: string, operationKey: string) {
    return this.alerts.findByOperationKey(organizationId, operationKey);
  }

  progress(organizationId: string, operationKey: string, patch: OperationLifecyclePatch) {
    return this.alerts.progress(organizationId, operationKey, patch);
  }

  succeed(organizationId: string, operationKey: string, patch?: OperationLifecyclePatch) {
    return this.alerts.succeed(organizationId, operationKey, patch);
  }

  fail(organizationId: string, operationKey: string, patch?: OperationLifecyclePatch) {
    return this.alerts.fail(organizationId, operationKey, patch);
  }

  cancel(organizationId: string, operationKey: string, patch?: OperationLifecyclePatch) {
    return this.alerts.cancel(organizationId, operationKey, patch);
  }

  closeBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
    status: OperationAlertCloseStatus,
    patch?: OperationLifecyclePatch,
  ) {
    return this.alerts.closeBySource(organizationId, sourceType, sourceId, status, patch);
  }

  closeStaleOperations(input: CloseStaleOperationAlertsInput) {
    return this.alerts.closeStaleOperations(input);
  }
}
