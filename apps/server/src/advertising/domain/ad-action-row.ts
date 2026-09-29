/**
 * The stored columns of one AdAction proposal, without its relations or
 * execution words (those come from its `advertising.ad_action` operation,
 * KID-386).
 * Application ports describe the aggregate with this type instead of the
 * Prisma model so the application layer stays Prisma-free (KID-258).
 */
export interface AdActionRow {
  id: string;
  organizationId: string;
  listingId: string | null;
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
  /** The Coupang account a run of this action writes to (KID-386). */
  channelAccountId: string | null;
  createdAt: Date;
}
