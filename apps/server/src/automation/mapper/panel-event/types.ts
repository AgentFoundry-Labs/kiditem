import type { PanelRunItem, PanelRunSource } from '@kiditem/shared/panel';

export interface PanelRunMapper<TInput = unknown> {
  source: PanelRunSource;
  mapToItem(input: TInput, organizationId: string): Omit<PanelRunItem, 'seq' | 'updatedAt'>;
  defaultVisibility(input: TInput): 'organization' | 'user';
}
