import type { PanelItem } from '@kiditem/shared';

export const PANEL_EVENTS = {
  UPSERT: 'panel.item.upsert',
  DISMISS: 'panel.item.dismiss',
} as const;

// Distributive Omit — union 멤버 각각에 Omit 적용 (PanelRunItem | PanelAlertItem 보존)
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

// 내부 버스 payload — companyId 포함 (라우팅 전용). 클라이언트로 나가기 전에 PanelSseService가 strip
export interface PanelUpsertInternal {
  item: DistributiveOmit<PanelItem, 'seq' | 'updatedAt'>;
  companyId: string;
}

export interface PanelDismissInternal {
  itemId: string;
  companyId: string;
}
