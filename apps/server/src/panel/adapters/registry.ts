import type { PanelRunAdapter } from './types';
import type { PanelRunSource } from '@kiditem/shared';
import { workflowPanelAdapter } from './workflow.adapter';

// TODO(Task 16/17): agent adapter lands in Task 16, image adapter in Task 18.
// Partial until all PanelRunSource entries have adapters.
export const panelRunAdapters = {
  workflow: workflowPanelAdapter,
} satisfies Partial<Record<PanelRunSource, PanelRunAdapter>>;
