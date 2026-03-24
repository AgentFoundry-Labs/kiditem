/**
 * TypeScript types inferred from Zod schemas.
 *
 * Use these types for component props, function signatures, etc.
 * Use the schemas (from ./schemas) for runtime validation.
 */
import type { z } from 'zod';
import type {
  ComponentSlotSchema,
  CSInfoSchema,
  DetailPageDataSchema,
  FAQItemSchema,
  FeatureItemSchema,
  KeyPointItemSchema,
  LayoutConfigSchema,
  MaterialItemSchema,
  SpecItemSchema,
} from './schemas';

export type FeatureItem = z.infer<typeof FeatureItemSchema>;
export type SpecItem = z.infer<typeof SpecItemSchema>;
export type FAQItem = z.infer<typeof FAQItemSchema>;
export type KeyPointItem = z.infer<typeof KeyPointItemSchema>;
export type MaterialItem = z.infer<typeof MaterialItemSchema>;
export type CSInfo = z.infer<typeof CSInfoSchema>;
export type ComponentSlot = z.infer<typeof ComponentSlotSchema>;
export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;
export type DetailPageData = z.infer<typeof DetailPageDataSchema>;
