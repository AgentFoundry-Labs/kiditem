import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');
const deletedLegacyTables = [
  'ad_snapshots',
  'traffic_stats',
  'item_winners',
  ' ads ',
];

describe('legacy market-data migration entrypoints', () => {
  it('does not expose migration commands/scripts that write deleted legacy market-data tables', () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).not.toHaveProperty('migrate:dashboard');

    for (const relativePath of [
      'scripts/migrate-dashboard-data.ts',
      'scripts/migrate-ad-data.ts',
    ]) {
      const absolutePath = join(repoRoot, relativePath);
      if (!existsSync(absolutePath)) continue;
      const contents = ` ${readFileSync(absolutePath, 'utf8')} `;
      for (const table of deletedLegacyTables) {
        expect(contents).not.toContain(table);
      }
    }
  });
});
