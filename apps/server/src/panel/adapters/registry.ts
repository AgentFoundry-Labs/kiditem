import type { PanelRunAdapter } from './types';
import type { PanelRunSource } from '@kiditem/shared';
import { workflowPanelAdapter } from './workflow.adapter';
import { agentPanelAdapter } from './agent.adapter';
import { imagePanelAdapter } from './image.adapter';

// All PanelRunSource entries have adapters — Partial<> removed (Task 18).
export const panelRunAdapters = {
  workflow: workflowPanelAdapter,
  agent: agentPanelAdapter,
  image: imagePanelAdapter,
} satisfies Record<PanelRunSource, PanelRunAdapter>;
