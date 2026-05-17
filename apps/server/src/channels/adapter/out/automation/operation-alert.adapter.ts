import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_ALERT_PORT as AUTOMATION_OPERATION_ALERT_PORT,
  type OperationAlertPort as AutomationOperationAlertPort,
} from '../../../../automation/application/port/in/operation-alert.port';
import type {
  OperationAlertPort,
  OperationLifecyclePatch,
  StartOperationAlertInput,
} from '../../../application/port/out/operation-alert.port';

@Injectable()
export class ChannelsOperationAlertAdapter implements OperationAlertPort {
  constructor(
    @Inject(AUTOMATION_OPERATION_ALERT_PORT)
    private readonly alerts: AutomationOperationAlertPort,
  ) {}

  start(input: StartOperationAlertInput) {
    return this.alerts.start(input);
  }

  succeed(organizationId: string, operationKey: string, patch?: OperationLifecyclePatch) {
    return this.alerts.succeed(organizationId, operationKey, patch);
  }

  fail(organizationId: string, operationKey: string, patch?: OperationLifecyclePatch) {
    return this.alerts.fail(organizationId, operationKey, patch);
  }
}
