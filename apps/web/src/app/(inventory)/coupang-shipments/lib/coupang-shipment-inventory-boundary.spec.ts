import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

describe('Coupang shipment inventory boundary', () => {
  it('does not create a KidItem stock-event draft from a local shipment file', () => {
    const source = readFileSync(
      resolve(webRoot, 'src/app/(inventory)/coupang-shipments/page.tsx'),
      'utf8',
    );

    expect(source).not.toContain('buildRocketEventDraftHref');
    expect(source).not.toContain('출고 재고 처리 초안');
  });
});
