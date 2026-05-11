import { describe, expect, it } from 'vitest';
import {
  DETAIL_IMAGE_COUNTS,
  DETAIL_PAGE_AGE_GROUPS,
  DETAIL_PAGE_TEMPLATE_IDS,
  DetailImageCountSchema,
  DetailPageAgeGroupSchema,
  DetailPageTemplateIdSchema,
} from '../ai';

describe('detail page shared AI contracts', () => {
  it('exports the API enum values used by web, DTOs, and Agent OS payloads', () => {
    expect(DETAIL_PAGE_TEMPLATE_IDS).toEqual(['kids-playful', 'bold-vertical']);
    expect(DETAIL_PAGE_AGE_GROUPS).toEqual(['age-8-plus', 'age-14-plus']);
    expect(DETAIL_IMAGE_COUNTS).toEqual(['auto', '1', '2', '3']);
  });

  it('accepts supported detail page control values and rejects unknown values', () => {
    expect(DetailPageTemplateIdSchema.parse('kids-playful')).toBe('kids-playful');
    expect(DetailPageAgeGroupSchema.parse('age-14-plus')).toBe('age-14-plus');
    expect(DetailImageCountSchema.parse('2')).toBe('2');

    expect(() => DetailPageTemplateIdSchema.parse('simple-vertical')).toThrow();
    expect(() => DetailPageAgeGroupSchema.parse('teen')).toThrow();
    expect(() => DetailImageCountSchema.parse('4')).toThrow();
  });
});
