// Outgoing port for the user-facing `Alert` notification store. Owns the
// unread/read lifecycle plus the promotion contract that creates an
// action task from an alert with race-guard. The contract is Prisma-free;
// repository adapters own ORM translation.

import type { AlertItem } from '@kiditem/shared/alerts';
import type { ActionTaskRecord, AlertRecord } from '../persistence-records';

export const ALERTS_REPOSITORY_PORT = Symbol('AlertsRepositoryPort');

export interface PromoteAlertCommand {
  alertId: string;
  organizationId: string;
  priorityOverride?: string;
  roleOverride?: string;
  /** Mapping function injected by the service so the domain mapping rules
   *  stay outside this persistence boundary. */
  resolvePriority: (alert: AlertRecord) => 'urgent' | 'high' | 'medium';
  resolveRole: (alert: AlertRecord) => string | null;
  /** Today's KST day-start used as the ActionTask date key. */
  date: Date;
}

export interface PromoteAlertResult {
  task: ActionTaskRecord;
  updatedAlert: AlertRecord;
}

export interface AlertsRepositoryPort {
  findUnreadAlerts(
    organizationId: string,
    limit?: number,
  ): Promise<AlertItem[]>;

  markAsRead(id: string, organizationId: string): Promise<AlertRecord>;

  markAllAsRead(organizationId: string): Promise<{ updated: number }>;

  /**
   * Atomic promotion of an alert to an ActionTask with race guards:
   *   - check alert exists + actionTaskId == null
   *   - actionTask.create inside transaction; P2002 → ConflictException
   *   - alert.updateMany ownership claim; count=0 → rollback + ConflictException
   *
   * Throws NotFoundException / ConflictException to match legacy semantics.
   */
  promoteAlertToTask(command: PromoteAlertCommand): Promise<PromoteAlertResult>;

  /** Dismiss = mark read; row stays in DB. Returns void; emits via service. */
  dismissAlert(id: string, organizationId: string): Promise<void>;
}
