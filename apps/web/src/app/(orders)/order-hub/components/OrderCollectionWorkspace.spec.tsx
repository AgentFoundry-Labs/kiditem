import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OrderCollectionWorkspace', () => {
  it('keeps transmission and inventory-verification recovery ahead of charts', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'OrderCollectionWorkspace.tsx'),
      'utf8',
    );

    expect(source).toContain('Sellpia 전송 필요');
    expect(source).toContain('전송 요청됨');
    expect(source).toContain('재고 반영 대기');
    expect(source.indexOf('<OrderCollectionRecovery')).toBeLessThan(
      source.indexOf('<OrderCollectionDailyPanel'),
    );
  });
});
