import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ALERT_KINDS = ['signal', 'operation'] as const;
export const ALERT_STATUSES = [
  'open',
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'resolved',
] as const;

export const ALERT_OPERATION_LIFECYCLE_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export const ALERT_SEVERITIES = [
  'info',
  'warning',
  'error',
  'critical',
] as const;

export const AlertKindSchema = z.enum(ALERT_KINDS);
export const AlertStatusSchema = z.enum(ALERT_STATUSES);
export const AlertOperationLifecycleStatusSchema = z.enum(
  ALERT_OPERATION_LIFECYCLE_STATUSES,
);
export const AlertSeveritySchema = z.enum(ALERT_SEVERITIES);

// Frontend-driven operation alert lifecycle (extension scrapes, etc.)
// Producers that live entirely in the browser still need the server to own
// the alert ledger so the panel can render running/succeeded/failed without
// a parallel client-side store. The server fills `actorUserId` /
// `organizationId` from the auth context and canonicalizes the display title /
// href for known producer tuples — the request body never carries tenant
// context.
export const StartOperationAlertRequestSchema = z.object({
  operationKey: z.string().min(1).max(200),
  type: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  message: z.string().max(2000).nullable().optional(),
  sourceType: z.string().min(1).max(64),
  sourceId: z.string().max(200).nullable().optional(),
  href: z.string().min(1).max(1024),
  severity: AlertSeveritySchema.optional(),
  progress: z.number().min(0).max(1).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateOperationAlertRequestSchema = z.object({
  status: AlertOperationLifecycleStatusSchema,
  message: z.string().max(2000).nullable().optional(),
  progress: z.number().min(0).max(1).nullable().optional(),
  severity: AlertSeveritySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

// schemas/alerts.ts: AlertItemSchema — server-internal full alert row (+organizationId).
// Projection: Prisma Alert 모델의 전체 행 매핑 (organizationId 포함).
// Alert is the dashboard notification + operation ledger surface. The DB row
// stays organization-scoped; `actorUserId` lets clients split "내 작업" from
// organization-wide items without creating a private inbox.

// GET /api/alerts 응답의 각 item
// 출처: alerts.service.ts findAll() — Prisma Alert 모델 기반
export const AlertItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: AlertKindSchema,
  status: AlertStatusSchema,
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  operationKey: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  actorUserId: z.string().uuid().nullable(),
  actionTaskId: z.string().uuid().nullable(),
  href: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
  metadata: z.record(z.unknown()),
  isRead: z.boolean(),
  readAt: zIsoDate.nullable(),
  startedAt: zIsoDate.nullable(),
  finishedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

export type AlertKind = z.infer<typeof AlertKindSchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type AlertOperationLifecycleStatus = z.infer<
  typeof AlertOperationLifecycleStatusSchema
>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type AlertItem = z.infer<typeof AlertItemSchema>;
export type StartOperationAlertRequest = z.infer<
  typeof StartOperationAlertRequestSchema
>;
export type UpdateOperationAlertRequest = z.infer<
  typeof UpdateOperationAlertRequestSchema
>;
