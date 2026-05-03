/**
 * Template registry — maps template IDs to their components and metadata.
 */
import type { ComponentType } from 'react';
import { boldVerticalConfig } from './bold-vertical/config';
import { BoldVertical } from './bold-vertical/index';
import { simpleVerticalConfig } from './simple-vertical/config';
import { SimpleVertical } from './simple-vertical/index';
import { kidsPlayfulConfig } from './kids-playful/config';
import { KidsPlayful } from './kids-playful/index';
import type { DetailPageData } from './types';

export interface TemplateConfig {
  /** Unique template identifier (kebab-case). */
  id: string;
  /** Display name (Korean). */
  name: string;
  /** Short description (Korean). */
  description: string;
  /** Font stylesheet URLs to load. */
  fonts: string[];
  /** Primary font-family CSS value. */
  fontFamily: string;
  /** Display font-family CSS value (if separate from primary). */
  displayFontFamily?: string;
  /** React component that renders the template. */
  component: ComponentType<{ data: DetailPageData }>;
}

/** All registered templates, keyed by template ID. */
export const templates: Record<string, TemplateConfig> = {
  'bold-vertical': {
    ...boldVerticalConfig,
    component: BoldVertical,
  },
  'simple-vertical': {
    ...simpleVerticalConfig,
    component: SimpleVertical,
  },
  'kids-playful': {
    ...kidsPlayfulConfig,
    component: KidsPlayful,
  },
};

/** Ordered list of template IDs for UI display. */
export const templateIds = ['bold-vertical', 'simple-vertical', 'kids-playful'] as const;

export type TemplateId = (typeof templateIds)[number];

/**
 * Get a template config by ID.
 *
 * @throws Error if template ID is not found.
 */
export function getTemplate(id: string): TemplateConfig {
  const template = templates[id];
  if (!template) {
    throw new Error(`Unknown template: "${id}". Available: ${templateIds.join(', ')}`);
  }
  return template;
}
