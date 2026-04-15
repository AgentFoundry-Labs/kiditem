import type { PanelRunItem, PanelRunSource } from '@kiditem/shared';

export interface PanelRunAdapter<TInput = unknown> {
  source: PanelRunSource;
  mapToItem(input: TInput, companyId: string): Omit<PanelRunItem, 'seq' | 'updatedAt'>;
  defaultVisibility(input: TInput): 'company' | 'user';
}
