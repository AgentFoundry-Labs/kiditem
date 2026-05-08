import { z } from 'zod';
import { PanelRunSourceSchema } from './sources.js';
import { AlertKindSchema, AlertStatusSchema } from '../schemas/alerts.js';

const PanelItemBase = z.object({
  id: z.string(),
  // organizationId는 서버 내부에서만 사용, 와이어에서는 drop됨
  seq: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  parentId: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  actorUserId: z.string().uuid().nullable(),
  visibility: z.enum(['organization', 'user']),
});

export const PanelRunItem = PanelItemBase.extend({
  kind: z.literal('run'),
  source: PanelRunSourceSchema,
  sourceId: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  progress: z.number().min(0).max(1).optional(),
  etaSeconds: z.number().optional(),
  deepLink: z.string(),
  errorMessage: z.string().optional(),
  // image source가 surface하는 sub-state (z.enum 조이지 않음 — ADR-0011 Rule 3)
  phase: z.string().nullable().optional(),
  // agent source가 surface하는 실패 유형 (z.enum 조이지 않음 — ADR-0011 Rule 3)
  failureType: z.string().nullable().optional(),
});

// panel/types.ts: PanelAlertItem — panel SSE stream projection.
//
// `kind` is the panel discriminant and must stay literal "alert". The DB
// ledger kind (`Alert.kind`) is exposed as `alertKind` to avoid colliding with
// `PanelItem = run | alert`.
export const PanelAlertItem = z.object({
  kind: z.literal('alert'),
  id: z.string().uuid(),
  alertKind: AlertKindSchema,
  status: AlertStatusSchema,
  severity: z.string(), // flat string — Alert.severity 분포는 future-proof
  type: z.string(), // flat string — 'internal:rules' 같은 namespacing 미스코프 (future ADR)
  title: z.string(),
  message: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  operationKey: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  isRead: z.boolean(),
  actionTaskId: z.string().uuid().nullable(),
  actorUserId: z.string().uuid().nullable(),
  href: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
  metadata: z.record(z.unknown()),
  readAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const PANEL_ITEM_KINDS = ['run', 'alert'] as const;
export type PanelItemKind = (typeof PANEL_ITEM_KINDS)[number];

export const PanelItem = z.discriminatedUnion('kind', [PanelRunItem, PanelAlertItem]);
export type PanelItem = z.infer<typeof PanelItem>;
export type PanelRunItem = z.infer<typeof PanelRunItem>;
export type PanelAlertItem = z.infer<typeof PanelAlertItem>;

// Wire events — dismiss는 itemId만 전송 (IMPORTANT #2)
export const PanelUpsertEvent = z.object({
  type: z.literal('upsert'),
  seq: z.number().int(),
  item: PanelItem,
});
export const PanelDismissEvent = z.object({
  type: z.literal('dismiss'),
  seq: z.number().int(),
  itemId: z.string(),
});
export const PanelSnapshotEvent = z.object({
  type: z.literal('snapshot'),
  seq: z.number().int(),
  items: z.array(PanelItem),
  resetClient: z.literal(true), // CRITICAL #9 — 서버 재시작 시 seq 리셋 핸드셰이크
});
export const PanelEvent = z.discriminatedUnion('type', [PanelUpsertEvent, PanelDismissEvent, PanelSnapshotEvent]);
export type PanelEvent = z.infer<typeof PanelEvent>;
