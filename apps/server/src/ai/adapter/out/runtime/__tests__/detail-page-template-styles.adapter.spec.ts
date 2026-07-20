import { describe, expect, it } from 'vitest';
import { DetailPageTemplateStylesAdapter } from '../detail-page-template-styles.adapter';

describe('DetailPageTemplateStylesAdapter', () => {
  it('loads the canonical compiled Tailwind stylesheet from @kiditem/templates', () => {
    const css = new DetailPageTemplateStylesAdapter().getCompiledCss();

    expect(css.length).toBeGreaterThan(30_000);
    expect(css).toMatch(/tailwindcss\s+v\d/i);
    expect(css).toContain('.rounded-');
  });
});
