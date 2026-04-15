import { z } from 'zod';
import { PanelRunSourceSchema } from './sources.js';

const PanelItemBase = z.object({
  id: z.string(),
  // companyId는 서버 내부에서만 사용, 와이어에서는 drop됨
  seq: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  parentId: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  actorUserId: z.string().uuid().nullable(),
  visibility: z.enum(['company', 'user']),
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
});

// PR2에서 PanelAlertItem 추가
export const PanelItem = z.discriminatedUnion('kind', [PanelRunItem]);
export type PanelItem = z.infer<typeof PanelItem>;
export type PanelRunItem = z.infer<typeof PanelRunItem>;

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
