import type { PanelRunAdapter } from './types';
import type { PanelRunSource } from '@kiditem/shared';
import { workflowPanelAdapter } from './workflow.adapter';

// PR2에서 agent, image_edit 추가
export const panelRunAdapters = {
  workflow: workflowPanelAdapter,
} satisfies Record<PanelRunSource, PanelRunAdapter>;
