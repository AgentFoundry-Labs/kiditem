import type { PanelRunAdapter } from './types';
import type { PanelRunSource } from '@kiditem/shared';
import { workflowPanelAdapter } from './workflow.adapter';
import { agentPanelAdapter } from './agent.adapter';

// TODO(Task 18): image adapter lands in Task 18.
// Partial until all PanelRunSource entries have adapters.
export const panelRunAdapters = {
  workflow: workflowPanelAdapter,
  agent: agentPanelAdapter,
} satisfies Partial<Record<PanelRunSource, PanelRunAdapter>>;
