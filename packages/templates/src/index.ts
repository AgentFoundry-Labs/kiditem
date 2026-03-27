// ─── Schemas (runtime validation) ───────────────────────────────────────────

export { boldVerticalConfig } from './bold-vertical/config';
// ─── Template Components ────────────────────────────────────────────────────
export { BoldVertical } from './bold-vertical/index';
export { placeholderDetailPageData } from './placeholder';
export type { TemplateConfig, TemplateId } from './registry';
// ─── Registry ───────────────────────────────────────────────────────────────
export { getTemplate, templateIds, templates } from './registry';
export {
  ComponentSlotSchema,
  CSInfoSchema,
  DetailPageDataSchema,
  FAQItemSchema,
  FeatureItemSchema,
  KeyPointItemSchema,
  LayoutConfigSchema,
  MaterialItemSchema,
  parseDetailPageData,
  SpecItemSchema,
} from './schemas';
export { simpleVerticalConfig } from './simple-vertical/config';
export { SimpleVertical } from './simple-vertical/index';
// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  ComponentSlot,
  CSInfo,
  DetailPageData,
  FAQItem,
  FeatureItem,
  KeyPointItem,
  LayoutConfig,
  MaterialItem,
  SpecItem,
} from './types';
