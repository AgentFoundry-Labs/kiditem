import type { PanelRunItem, PanelRunSource } from '@kiditem/shared/panel';

export interface PanelRunAdapter<TInput = unknown> {
  source: PanelRunSource;
  mapToItem(input: TInput, companyId: string): Omit<PanelRunItem, 'seq' | 'updatedAt'>;
  defaultVisibility(input: TInput): 'company' | 'user';
}
