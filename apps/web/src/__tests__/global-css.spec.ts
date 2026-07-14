import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('global page layout css', () => {
  it('defines a light-only application theme', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

    expect(css).toMatch(/:root\s*{[^}]*color-scheme:\s*light;/s);
    expect(css).not.toMatch(/\.dark\s*{/);
    expect(css).not.toContain('color-scheme: dark');
  });

  it('reserves vertical scrollbar space to prevent width shifts between short and long tabs', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

    expect(css).toMatch(/html\s*{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*scroll;[^}]*scrollbar-gutter:\s*stable;/s);
    expect(css).toMatch(/body\s*{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*visible;/s);
  });
});
