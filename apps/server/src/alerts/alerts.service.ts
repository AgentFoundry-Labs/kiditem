import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlertsRepository } from './alerts.repository';
import type {
  AlertItem,
  SourceFailureAlertInput,
} from '@kiditem/shared/alerts';

export type { SourceFailureAlertInput } from '@kiditem/shared/alerts';

/**
 * Focused source failure + operator notification seam.
 *
 * The source methods deliberately accept the owner's transaction client. A
 * source terminal mutation and its Alert therefore commit or roll back as a
 * single PostgreSQL unit without an event, outbox, or generic alert port.
 */
@Injectable()
export class SourceFailureAlerts {
  constructor(private readonly repository: AlertsRepository) {}

  list(organizationId: string): Promise<AlertItem[]> {
    return this.repository.list(organizationId);
  }

  dismiss(id: string, organizationId: string): Promise<void> {
    return this.repository.dismiss(id, organizationId);
  }

  upsertSourceFailure(
    tx: Prisma.TransactionClient,
    input: SourceFailureAlertInput,
  ): Promise<void> {
    return this.repository.upsertSourceFailure(tx, input);
  }

  resolveSourceFailure(
    tx: Prisma.TransactionClient,
    input: Pick<SourceFailureAlertInput, 'organizationId' | 'dedupeKey' | 'attemptId'>,
  ): Promise<void> {
    return this.repository.resolveSourceFailure(tx, input);
  }
}
