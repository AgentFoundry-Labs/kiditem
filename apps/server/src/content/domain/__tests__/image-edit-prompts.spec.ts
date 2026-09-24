import { describe, expect, it } from 'vitest';
import {
  buildColorGuideImageEditPrompt,
  buildImageEditPrompt,
} from '../image-edit-prompts';

describe('image edit prompts', () => {
  it('defaults to custom editing without background removal language', () => {
    const prompt = buildImageEditPrompt({
      preset: 'custom',
      userPrompt: 'Change only the ribbon to yellow',
    });

    expect(prompt).toContain('Preserve the exact product identity');
    expect(prompt).toContain('Change only the ribbon to yellow');
    expect(prompt).not.toContain('checkerboard');
  });

  it('uses white-background cutout instructions for remove_background', () => {
    const prompt = buildImageEditPrompt({
      preset: 'remove_background',
      userPrompt: 'crisp edges',
    });

    expect(prompt).toContain('pure white (#FFFFFF) background');
    expect(prompt).toContain('Do not output transparency');
    expect(prompt).toContain('checkerboard');
    expect(prompt).toContain('Additional: crisp edges');
  });

  it('builds a multi-image color guide prompt', () => {
    const prompt = buildColorGuideImageEditPrompt();

    expect(prompt).toContain('side by side');
    expect(prompt).toContain('Do NOT add any text');
  });
});
