import { Injectable } from '@nestjs/common';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type {
  AdvertisingSourceAlert,
  AdvertisingSourceAlertPort,
} from '../../../application/port/out/repository/advertising-source-alert.port';

@Injectable()
export class AdvertisingSourceAlertAdapter implements AdvertisingSourceAlertPort {
  constructor(private readonly alerts: SourceFailureAlerts) {}

  recordFailure(tx: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    alert: AdvertisingSourceAlert;
    code: string;
    message: string;
  }): Promise<void> {
    return this.alerts.recordTerminalOutcome(ownerTransactionClient(tx), {
      code: input.code,
      organizationId: input.organizationId,
      dedupeKey: input.alert.dedupeKey,
      sourceType: input.alert.sourceType,
      attemptId: input.operationId,
      title: input.alert.title,
      message: input.message,
      href: input.alert.href,
    });
  }

  resolve(tx: OwnerTransaction, input: { organizationId: string; operationId: string; alert: AdvertisingSourceAlert }): Promise<void> {
    return this.alerts.resolveSourceFailure(ownerTransactionClient(tx), {
      organizationId: input.organizationId,
      dedupeKey: input.alert.dedupeKey,
      attemptId: input.operationId,
    });
  }
}
