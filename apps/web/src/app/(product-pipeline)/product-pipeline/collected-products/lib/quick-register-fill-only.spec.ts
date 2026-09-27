import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mall form guidance', () => {
  it('no mall form tells the operator to register by hand — the registration run asks the extension gate to press [등록]', () => {
    const dir = path.resolve(__dirname, '../../_shared/lib');
    const forms = readdirSync(dir).filter((file) => file.endsWith('-registration-form.ts'));
    expect(forms.length).toBeGreaterThan(5);
    for (const file of forms) {
      expect(readFileSync(path.join(dir, file), 'utf8'), file).not.toContain('직접 등록하세요');
    }
  });
});
