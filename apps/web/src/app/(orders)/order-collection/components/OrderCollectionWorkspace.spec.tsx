import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OrderCollectionWorkspace', () => {
  it('preserves the exact c9 visual block order with compact freshness in the header', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'OrderCollectionWorkspace.tsx'),
      'utf8',
    );

    const pipeline = source.indexOf('<OrderCollectionPipeline');
    const daily = source.indexOf('<OrderCollectionDailyPanel');
    const activity = source.indexOf('<OrderActivityFeed');
    const malls = source.indexOf('<MallAccountSection');
    const preview = source.indexOf('<FilePreviewSection');
    const generated = source.indexOf('<GeneratedFilesSection');

    expect(source).toContain('<SellpiaWorkspaceFreshnessStatus');
    expect(source).not.toContain('<OrderCollectionRecovery');
    expect(pipeline).toBeLessThan(daily);
    expect(daily).toBeLessThan(activity);
    expect(activity).toBeLessThan(malls);
    expect(malls).toBeLessThan(preview);
    expect(preview).toBeLessThan(generated);
  });
});
