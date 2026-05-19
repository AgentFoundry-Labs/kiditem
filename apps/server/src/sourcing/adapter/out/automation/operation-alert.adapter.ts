import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_ALERT_PORT as AUTOMATION_OPERATION_ALERT_PORT,
  type OperationAlertPort as AutomationOperationAlertPort,
} from '../../../../automation/application/port/in/operation-alert.port';
import type {
  OperationAlertPort,
  StartOperationAlertInput,
} from '../../../application/port/out/cross-domain/operation-alert.port';

@Injectable()
export class SourcingOperationAlertAdapter implements OperationAlertPort {
  constructor(
    @Inject(AUTOMATION_OPERATION_ALERT_PORT)
    private readonly alerts: AutomationOperationAlertPort,
  ) {}

  async start(input: StartOperationAlertInput): Promise<void> {
    await this.alerts.start(input);
  }
}
