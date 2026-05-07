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

export const AlertKindSchema = z.enum(ALERT_KINDS);
export const AlertStatusSchema = z.enum(ALERT_STATUSES);

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
export type AlertItem = z.infer<typeof AlertItemSchema>;
