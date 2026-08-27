import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../tailwind.config';

type SemanticColors = Record<string, string | Record<string, string>>;

function semanticColors() {
  const extend = tailwindConfig.theme?.extend as { colors?: SemanticColors } | undefined;
  return extend?.colors ?? {};
}

describe('Tailwind semantic color contract', () => {
  it('maps the conversation surfaces to concrete opaque design tokens instead of undeclared utilities', () => {
    const colors = semanticColors();

    expect(colors.primary).toEqual({
      DEFAULT: 'var(--primary)',
      foreground: 'var(--primary-contrast)',
      soft: 'var(--primary-soft)',
    });
    expect(colors.popover).toEqual({
      DEFAULT: 'var(--surface-raised)',
      foreground: 'var(--foreground)',
    });
    expect(colors.muted).toEqual({
      DEFAULT: 'var(--surface-sunken)',
      foreground: 'var(--text-tertiary)',
    });
    expect(colors.destructive).toEqual({
      DEFAULT: 'var(--danger)',
      foreground: 'var(--primary-contrast)',
    });
    expect(colors.ring).toBe('var(--primary)');
    expect(colors.input).toBe('var(--border)');
    expect(colors['conversation-user']).toEqual({
      DEFAULT: 'var(--conversation-user-bg)',
      foreground: 'var(--conversation-user-foreground)',
    });
  });
});
