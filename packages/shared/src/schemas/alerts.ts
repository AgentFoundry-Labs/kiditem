import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ALERT_STATUSES = ['OPEN', 'RESOLVED'] as const;

export const AlertStatusSchema = z.enum(ALERT_STATUSES);

export const SourceFailureAlertInputSchema = z.object({
  // The input is an owner-to-owner command. Its caller already holds the
  // authenticated organization context and source attempt identity; UUID
  // validation belongs to the source owner's request boundary.
  organizationId: z.string().min(1),
  dedupeKey: z.string().min(1).max(255),
  sourceType: z.string().min(1).max(128),
  attemptId: z.string().min(1),
  title: z.string().min(1).max(200),
  /**
   * The owner's terminal code. The alerts module reads it to decide whether the
   * outcome is worth an operator's attention — a cancellation is not — so it is
   * the one field that changes whether a row is written at all.
   */
  code: z.string().min(1).max(128),
  /**
   * Raw text from the owner. It is redacted and truncated on the way in; the
   * caller does not do either, and does not restate the column width.
   */
  message: z.string().max(2000),
  href: z.string().min(1).max(1024),
});

// schemas/alerts.ts: AlertItemSchema — what a reader of the alert list gets.
//
// This was the whole Prisma row, 23 fields, and it parsed nothing: the only
// place that executed it was its own unit test. Six fields — organizationId,
// dedupeKey, sourceId, actorUserId, metadata, readAt — travelled to the browser
// and were read by nobody; they stay on the row, where the module that owns
// them uses them, and leave the read. `severity` left too: every source
// failure is an error, so the word told a screen nothing.
//
// `attemptId` stays. No screen shows it, but "the alert follows the attempt" is
// the rule behind the replay no-op and resolve-by-attempt, and seven suites
// assert it through this read — the interface is the test surface, and removing
// it left that invariant with no way to be checked.
export const AlertItemSchema = z.object({
  id: z.string().uuid(),
  attemptId: z.string().uuid().nullable().optional(),
  status: AlertStatusSchema,
  type: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  // No current writer names a target: a source failure is about a source, not
  // a product, so both stay null.
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  sourceType: z.string().nullable(),
  href: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type AlertItem = z.infer<typeof AlertItemSchema>;
export type SourceFailureAlertInput = z.infer<
  typeof SourceFailureAlertInputSchema
>;
