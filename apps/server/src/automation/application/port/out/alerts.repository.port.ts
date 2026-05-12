// Outgoing port for the user-facing `Alert` notification store. Owns the
// unread/read lifecycle plus the promotion contract that creates an
// `ActionTask` from an `Alert` with race-guard.

import type { Alert, ActionTask, Prisma } from '@prisma/client';
import type { AlertItem } from '@kiditem/shared/alerts';

export const ALERTS_REPOSITORY_PORT = Symbol('AlertsRepositoryPort');

export interface PromoteAlertCommand {
  alertId: string;
  organizationId: string;
  priorityOverride?: string;
  roleOverride?: string;
  /** Mapping function injected by the service so the domain mapping rules
   *  stay outside this persistence boundary. */
  resolvePriority: (alert: Alert) => 'urgent' | 'high' | 'medium';
  resolveRole: (alert: Alert) => string | null;
  /** Today's KST day-start used as the ActionTask date key. */
  date: Date;
}

export interface PromoteAlertResult {
  task: ActionTask;
  updatedAlert: Alert;
}

export interface AlertsRepositoryPort {
  findUnreadAlerts(
    organizationId: string,
    limit?: number,
  ): Promise<AlertItem[]>;

  markAsRead(id: string, organizationId: string): Promise<Alert>;

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

/**
 * Update payload type re-exported for adapter implementations. Service
 * code does not depend on this; it's used inside the adapter only.
 */
export type AlertUpdatePayload = Prisma.AlertUpdateManyMutationInput;
