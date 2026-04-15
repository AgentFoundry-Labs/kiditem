import type { PanelItem } from '@kiditem/shared';

export const PANEL_EVENTS = {
  UPSERT: 'panel.item.upsert',
  DISMISS: 'panel.item.dismiss',
} as const;

// 내부 버스 payload — companyId 포함 (라우팅 전용). 클라이언트로 나가기 전에 PanelSseService가 strip
export interface PanelUpsertInternal {
  item: Omit<PanelItem, 'seq' | 'updatedAt'>;
  companyId: string;
}

export interface PanelDismissInternal {
  itemId: string;
  companyId: string;
}
