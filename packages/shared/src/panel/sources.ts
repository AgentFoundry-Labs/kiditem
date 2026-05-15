import { z } from 'zod';

export const PANEL_RUN_SOURCES = {
  workflow: {
    label: '워크플로우',
    iconName: 'Workflow',
    deepLinkPattern: '/workflows/runs/:id',
  },
  agent: {
    label: '에이전트',
    iconName: 'Bot',
    deepLinkPattern: '/agents/runs/:id',
  },
  image: {
    label: '이미지',
    iconName: 'Image',
    deepLinkPattern: '/product-pipeline/thumbnail-generation?generationId=:id',
  },
} as const;

export type PanelRunSource = keyof typeof PANEL_RUN_SOURCES;
const sourceKeys = Object.keys(PANEL_RUN_SOURCES) as [PanelRunSource, ...PanelRunSource[]];
export const PanelRunSourceSchema = z.enum(sourceKeys);
