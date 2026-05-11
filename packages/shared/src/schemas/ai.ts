import { z } from 'zod';

export const DETAIL_PAGE_TEMPLATE_IDS = ['kids-playful', 'bold-vertical'] as const;
export const DETAIL_PAGE_AGE_GROUPS = ['age-8-plus', 'age-14-plus'] as const;
export const DETAIL_IMAGE_COUNTS = ['auto', '1', '2', '3'] as const;

export const DetailPageTemplateIdSchema = z.enum(DETAIL_PAGE_TEMPLATE_IDS);
export const DetailPageAgeGroupSchema = z.enum(DETAIL_PAGE_AGE_GROUPS);
export const DetailImageCountSchema = z.enum(DETAIL_IMAGE_COUNTS);

export type DetailPageTemplateId = z.infer<typeof DetailPageTemplateIdSchema>;
export type DetailPageAgeGroup = z.infer<typeof DetailPageAgeGroupSchema>;
export type DetailImageCount = z.infer<typeof DetailImageCountSchema>;
