/**
 * The stored columns of one AdAction proposal, without its relations or
 * execution words (those come from the latest ExecutionTask, KID-122).
 * Application ports describe the aggregate with this type instead of the
 * Prisma model so the application layer stays Prisma-free (KID-258).
 */
export interface AdActionRow {
  id: string;
  organizationId: string;
  listingId: string | null;
  listingOptionId: string | null;
  adTargetDailyId: string | null;
  actionType: string;
  targetType: string;
  externalId: string | null;
  targetLabel: string;
  reason: string;
  priority: string;
  currentValue: number | null;
  proposedValue: number | null;
  /** Rule-specific proposal detail as stored JSON. */
  payload: unknown;
  approvalStatus: string;
  approvedAt: Date | null;
  createdAt: Date;
}
