import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataMigrations } from '../data-migrations';

const MIGRATION_ID = 'v0.1.30:004_canonical_master_inventory_identity';

describe('canonical MasterProduct inventory identity migration', () => {
  it('keeps its applied source but leaves the registry when the cached grade column is dropped', () => {
    // It clears MasterProduct.abcGrade through the Prisma client, which the
    // KID-90 schema drop removes. Release 0.1.30 has not reached main, so the
    // registration goes without inactive lineage.
    expect(dataMigrations.map((item) => item.id)).not.toContain(MIGRATION_ID);

    const source = readFileSync(resolve(
      import.meta.dirname,
      '../data-migrations/v0.1.30/004_canonical_master_inventory_identity.ts',
    ), 'utf8');
    expect(source).toContain(MIGRATION_ID);
    expect(source).toContain('planCanonicalInventoryLinks');
    expect(source).toContain('originChannelListingId: null');
    expect(source).toContain('masterProductId: canonicalProduct.id');
    expect(source).toContain('isActive: false, abcGrade: null');
  });
});
