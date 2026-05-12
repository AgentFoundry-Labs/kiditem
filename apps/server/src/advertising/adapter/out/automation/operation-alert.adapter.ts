// Cross-domain adapter wrapping `automation.OperationAlertService` behind
// advertising's consumer-side `OperationAlertPort`. This is the only file
// in advertising that imports another owner-domain's service directly; the
// architecture spec excludes `adapter/out/automation/**` from the
// cross-domain rule because the import is intentional here.

import { Injectable } from '@nestjs/common';
import { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';
import type {
  OperationAlertPort,
  StartOperationAlertInput,
} from '../../../application/port/out/operation-alert.port';

@Injectable()
export class OperationAlertAdapter implements OperationAlertPort {
  constructor(private readonly alerts: OperationAlertService) {}

  async start(input: StartOperationAlertInput): Promise<void> {
    await this.alerts.start(input);
  }
}
