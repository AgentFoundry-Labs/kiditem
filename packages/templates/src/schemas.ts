/**
 * Zod schemas for detail page template data.
 *
 * Mirrors the Python `DetailPageData` Pydantic model (apps/backend/app/schemas/content.py).
 * Fields use camelCase (TypeScript convention). Use `parseDetailPageData()` to convert
 * from snake_case API responses.
 */
import { z } from 'zod';

// ─── Sub-model Schemas ──────────────────────────────────────────────────────

export const FeatureItemSchema = z.object({
  icon: z.string().default('✨'),
  title: z.string(),
  description: z.string().default(''),
});

export const SpecItemSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const FAQItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const KeyPointItemSchema = z.object({
  number: z.number(),
  title: z.string(),
  description: z.string(),
  images: z.array(z.string()).default([]),
});

export const MaterialItemSchema = z.object({
  image: z.string().default(''),
  title: z.string(),
  description: z.string().default(''),
});

export const CSInfoSchema = z.object({
  phone: z.string().default(''),
  kakao: z.string().default(''),
  refundRules: z.array(z.string()).default([]),
});

export const ComponentSlotSchema = z.object({
  type: z.string(),
  enabled: z.boolean().default(true),
  divider: z.string().default('line'),
  overrides: z.record(z.string()).default({}),
});

export const LayoutConfigSchema = z.object({
  components: z.array(ComponentSlotSchema).default([
    { type: 'main_hook', enabled: true, divider: 'none', overrides: {} },
    { type: 'product_images', enabled: true, divider: 'none', overrides: {} },
    { type: 'key_points', enabled: true, divider: 'space', overrides: {} },
    { type: 'spec_table', enabled: true, divider: 'line', overrides: {} },
    { type: 'feature_grid', enabled: true, divider: 'line', overrides: {} },
    { type: 'material_info', enabled: true, divider: 'line', overrides: {} },
    { type: 'cs_refund', enabled: true, divider: 'line', overrides: {} },
  ]),
});

// ─── Main Schema ────────────────────────────────────────────────────────────

export const DetailPageDataSchema = z.object({
  // Product info
  title: z.string(),
  subtitle: z.string().default(''),
  description: z.array(z.string()),
  badge: z.string().default('BEST PICK'),

  // Main hook (top section)
  hookText: z.string().default(''),
  hookTitleSub: z.string().default(''),
  hookSubtext: z.string().default(''),

  // Price (optional)
  price: z.number().nullable().default(null),
  originalPrice: z.number().nullable().default(null),
  discountRate: z.number().nullable().default(null),

  // Images
  images: z.array(z.string()).default([]),
  heroBanner: z.string().default(''),
  sizeImages: z.array(z.string()).default([]),
  sizeDisplayMode: z.string().default('normal'),
  detailImages: z.array(z.string()).default([]),

  // Key selling points
  keyPoints: z.array(KeyPointItemSchema).default([]),

  // Content sections
  bulletPoints: z.array(z.string()).default([]),
  features: z.array(FeatureItemSchema).default([]),
  specs: z.array(SpecItemSchema).default([]),

  // Materials
  materials: z.array(MaterialItemSchema).default([]),

  // CS info
  csInfo: CSInfoSchema.nullable().default(null),

  // Simple vertical fields
  colorText: z.string().default(''),
  detailText: z.string().default(''),
  notes: z.array(z.string()).default([]),

  // Section labels
  sectionName: z.string().default(''),
  sectionTitle: z.string().default(''),
  sectionSubtitle: z.array(z.string()).default([]),
  detailTitle: z.string().default('DETAIL'),
  sizeTitle: z.string().default('사이즈 안내'),
  sizeSubtitle: z.string().default(''),

  // Theme tokens
  themeColorMain: z.string().default('#ff8c69'),
  themeColorBgLight: z.string().default('#fffaf0'),
  themeColorBadge1: z.string().default('#ff8c69'),
  themeColorBadge2: z.string().default('#69c9ff'),
  themeSectionBg: z.string().default('#f4f1eb'),
  themeTextPrimary: z.string().default('#4a4a4a'),
  themeTextSecondary: z.string().default('#8a8a8a'),
  themeBorderRadius: z.string().default('32px'),
  recycleMaterial: z.string().default('종이'),

  // Product info (spec table in some templates)
  productInfo: z.array(SpecItemSchema).default([]),

  // Legacy fields
  faqs: z.array(FAQItemSchema).default([]),
  keywords: z.array(z.string()).default([]),
  trustBadges: z.array(z.string()).default([]),
  ctaText: z.string().default('지금 바로 구매하기'),
  ctaSubtext: z.string().default(''),

  // Layout
  layout: LayoutConfigSchema.nullable().default(null),

  generationMode: z.string().default('template'),
});

// ─── API Response Parsing ───────────────────────────────────────────────────

/** Map of snake_case keys → camelCase keys for DetailPageData. */
const SNAKE_TO_CAMEL: Record<string, string> = {
  hook_text: 'hookText',
  hook_title_sub: 'hookTitleSub',
  hook_subtext: 'hookSubtext',
  original_price: 'originalPrice',
  discount_rate: 'discountRate',
  hero_banner: 'heroBanner',
  size_images: 'sizeImages',
  size_display_mode: 'sizeDisplayMode',
  detail_images: 'detailImages',
  key_points: 'keyPoints',
  bullet_points: 'bulletPoints',
  cs_info: 'csInfo',
  color_text: 'colorText',
  detail_text: 'detailText',
  section_name: 'sectionName',
  section_title: 'sectionTitle',
  section_subtitle: 'sectionSubtitle',
  detail_title: 'detailTitle',
  size_title: 'sizeTitle',
  size_subtitle: 'sizeSubtitle',
  theme_color_main: 'themeColorMain',
  theme_color_bg_light: 'themeColorBgLight',
  theme_color_badge_1: 'themeColorBadge1',
  theme_color_badge_2: 'themeColorBadge2',
  theme_section_bg: 'themeSectionBg',
  theme_text_primary: 'themeTextPrimary',
  theme_text_secondary: 'themeTextSecondary',
  theme_border_radius: 'themeBorderRadius',
  recycle_material: 'recycleMaterial',
  product_info: 'productInfo',
  trust_badges: 'trustBadges',
  cta_text: 'ctaText',
  cta_subtext: 'ctaSubtext',
  refund_rules: 'refundRules',
  generation_mode: 'generationMode',
};

function transformKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = SNAKE_TO_CAMEL[key] ?? key;
      result[camelKey] = transformKeys(value);
    }
    return result;
  }
  return obj;
}

/**
 * Parse a snake_case API response into a validated DetailPageData object.
 *
 * Handles both snake_case (from Python API) and camelCase (already transformed) inputs.
 */
export function parseDetailPageData(raw: unknown): z.infer<typeof DetailPageDataSchema> {
  const transformed = transformKeys(raw);
  return DetailPageDataSchema.parse(transformed);
}
