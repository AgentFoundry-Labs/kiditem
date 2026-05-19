// Cross-domain adapter wrapping automation's owner-side
// `OPERATION_ALERT_PORT` behind advertising's consumer-side
// `OperationAlertPort`. This is the only file in advertising that reaches
// into another owner-domain's port surface; the architecture spec excludes
// `adapter/out/automation/**` from the cross-domain rule because the
// dependency is intentional here.
//
// Before automation's owner-side publish landed this adapter injected
// `OperationAlertService` concretely; with the owner-side port in place
// it depends on the published Nest token instead, leaving the
// architecture spec free of class-name carve-outs.

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
export class OperationAlertAdapter implements OperationAlertPort {
  constructor(
    @Inject(AUTOMATION_OPERATION_ALERT_PORT)
    private readonly alerts: AutomationOperationAlertPort,
  ) {}

  async start(input: StartOperationAlertInput): Promise<void> {
    await this.alerts.start(input);
  }
}
