import { z } from 'zod';

export const PANEL_RUN_SOURCES = {
  workflow: {
    label: '워크플로우',
    iconName: 'Workflow',
    deepLinkPattern: '/workflows/runs/:id',
  },
  // PR2에서 agent, image_edit 추가
} as const;

export type PanelRunSource = keyof typeof PANEL_RUN_SOURCES;
const sourceKeys = Object.keys(PANEL_RUN_SOURCES) as [PanelRunSource, ...PanelRunSource[]];
export const PanelRunSourceSchema = z.enum(sourceKeys);
