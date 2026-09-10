import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ALERT_KINDS = ['signal'] as const;
export const ALERT_STATUSES = ['OPEN', 'RESOLVED'] as const;

export const SOURCE_FAILURE_ALERT_SEVERITIES = [
  'warning',
  'error',
  'critical',
] as const;

export const ALERT_SEVERITIES = [
  'info',
  'warning',
  'error',
  'critical',
] as const;

export const AlertKindSchema = z.enum(ALERT_KINDS);
export const AlertStatusSchema = z.enum(ALERT_STATUSES);
export const AlertSeveritySchema = z.enum(ALERT_SEVERITIES);

export const SourceFailureAlertInputSchema = z.object({
  // The input is an owner-to-owner command. Its caller already holds the
  // authenticated organization context and source attempt identity; UUID
  // validation belongs to the source owner's request boundary.
  organizationId: z.string().min(1),
  dedupeKey: z.string().min(1).max(255),
  sourceType: z.string().min(1).max(128),
  attemptId: z.string().min(1),
  severity: z.enum(SOURCE_FAILURE_ALERT_SEVERITIES),
  title: z.string().min(1).max(200),
  message: z.string().max(2000),
  href: z.string().min(1).max(1024),
});

// schemas/alerts.ts: AlertItemSchema — server-internal full alert row (+organizationId).
// Projection: Prisma Alert 모델의 전체 행 매핑 (organizationId 포함).
// Alert is the focused durable notification surface. The DB row stays
// organization-scoped; Rules signals may identify a target and actor.

// GET /api/alerts 응답의 각 item
// 출처: alerts.service.ts list() — Prisma Alert 모델 기반
export const AlertItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  // New source alerts always include these fields. They stay optional here so
  // the compatibility projection can still parse pre-cutover legacy rows.
  dedupeKey: z.string().nullable().optional(),
  attemptId: z.string().uuid().nullable().optional(),
  kind: AlertKindSchema,
  status: AlertStatusSchema,
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  actorUserId: z.string().uuid().nullable(),
  href: z.string().nullable(),
  metadata: z.record(z.unknown()),
  isRead: z.boolean(),
  readAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

export type AlertKind = z.infer<typeof AlertKindSchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type AlertItem = z.infer<typeof AlertItemSchema>;
export type SourceFailureAlertInput = z.infer<
  typeof SourceFailureAlertInputSchema
>;
