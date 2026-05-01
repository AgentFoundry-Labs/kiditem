import type { PanelItem } from '@kiditem/shared/panel';

export const PANEL_EVENTS = {
  UPSERT: 'panel.item.upsert',
  DISMISS: 'panel.item.dismiss',
} as const;

// 내부 버스 payload — organizationId 포함 (라우팅 전용). 클라이언트로 나가기 전에 PanelSseService가 strip
export interface PanelUpsertInternal {
  item: Omit<PanelItem, 'seq' | 'updatedAt'>;
  organizationId: string;
}

export interface PanelDismissInternal {
  itemId: string;
  organizationId: string;
}
