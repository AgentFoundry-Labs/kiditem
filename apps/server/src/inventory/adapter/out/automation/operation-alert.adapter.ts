import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_ALERT_PORT as AUTOMATION_OPERATION_ALERT_PORT,
  type OperationAlertPort as AutomationOperationAlertPort,
} from '../../../../automation/application/port/in/operation-alert.port';
import type {
  InventoryOperationAlertPort,
  InventoryOperationLifecyclePatch,
} from '../../../application/port/out/cross-domain/operation-alert.port';

@Injectable()
export class InventoryOperationAlertAdapter
implements InventoryOperationAlertPort {
  constructor(
    @Inject(AUTOMATION_OPERATION_ALERT_PORT)
    private readonly alerts: AutomationOperationAlertPort,
  ) {}

  fail(
    organizationId: string,
    operationKey: string,
    patch?: InventoryOperationLifecyclePatch,
  ) {
    return this.alerts.fail(organizationId, operationKey, patch);
  }
}
