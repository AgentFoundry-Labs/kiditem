import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADR_0010_KEPT_TABLES,
  assertRequiredColumnCleanups,
  defineRequiredColumnCleanups,
  removeRowsBlockingRequiredColumns,
  type RequiredColumnCleanup,
  requiredColumnCleanupTable,
} from '../data-migrations/helpers/required-column-row-cleanup';
import { requiredColumnCleanupTransaction } from './fixtures/required-column-cleanup-transaction';

const repoRoot = join(__dirname, '..', '..');
const KEPT_TABLES: string[] = Object.values(ADR_0010_KEPT_TABLES).flat();

/** A cleanup a later release might add: the helper needs only this entry. */
const WIDGET_FACTS: RequiredColumnCleanup = {
  table: 'widget_facts',
  requiredColumn: 'collection_run_id',
  reason: 'A later schema makes collection_run_id required, and old widget facts name no run.',
};

const readText = (path: string) => readFileSync(join(repoRoot, path), 'utf8').replace(/\s+/g, ' ');

function modelTables(): Map<string, string> {
  const modelsDir = join(repoRoot, 'prisma', 'models');
  const tables = new Map<string, string>();
  for (const file of readdirSync(modelsDir).filter((name) => name.endsWith('.prisma'))) {
    const schema = readFileSync(join(modelsDir, file), 'utf8');
    for (const match of schema.matchAll(/((?:^\/\/\/.*\n)*)^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
      const table = match[3]!.match(/@@map\("([^"]+)"\)/)?.[1] ?? match[2]!;
      tables.set(table, match[1] ?? '');
    }
  }
  return tables;
}

describe('required-column row cleanup helper', () => {
  it('runs a new list with no other code: deletes, counts, and reports each entry', async () => {
    const cleanups = defineRequiredColumnCleanups([
      WIDGET_FACTS,
      { table: 'gadget_facts', requiredColumn: 'collection_run_id', reason: WIDGET_FACTS.reason },
      { table: 'missing_facts', requiredColumn: 'collection_run_id', reason: WIDGET_FACTS.reason },
    ]);
    const db = requiredColumnCleanupTransaction({
      tables: {
        widget_facts: { rows: 3, columns: ['id'] },
        gadget_facts: { rows: 2, columns: ['id', 'collection_run_id'] },
      },
      requiredColumns: { widget_facts: 'collection_run_id', gadget_facts: 'collection_run_id' },
    });

    await expect(removeRowsBlockingRequiredColumns(db.tx as never, cleanups)).resolves.toEqual({
      affectedRows: 3,
      details: {
        widget_facts: { requiredColumn: 'collection_run_id', tablePresent: true, requiredColumnPresent: false, deletedRows: 3 },
        gadget_facts: { requiredColumn: 'collection_run_id', tablePresent: true, requiredColumnPresent: true, deletedRows: 0 },
        missing_facts: { requiredColumn: 'collection_run_id', tablePresent: false, requiredColumnPresent: false, deletedRows: 0 },
      },
    });
    expect(db.deletes()).toEqual(['DELETE FROM "widget_facts"']);
    expect(db.rowsOf('gadget_facts')).toBe(2);
    // The reach check runs before the catalog lookup and every delete.
    expect(db.statements[0]).toMatch(/^WITH RECURSIVE deleted/);
    expect(db.statements[1]).toMatch(/FROM unnest\(/);
  });

  it('refuses every ADR-0010 kept table when a list is defined', () => {
    expect(KEPT_TABLES.length).toBeGreaterThan(0);
    for (const table of KEPT_TABLES) {
      expect(
        () => defineRequiredColumnCleanups([WIDGET_FACTS, { ...WIDGET_FACTS, table }]),
        table,
      ).toThrow(`Required-column cleanup refuses ${table}: ADR-0010 carries its rows through every cutover.`);
    }
  });

  it('refuses a kept table at run start, before any statement reaches the database', async () => {
    for (const table of ['orders', 'channel_accounts', 'users']) {
      const db = requiredColumnCleanupTransaction({
        tables: { widget_facts: { rows: 3, columns: [] }, [table]: { rows: 9, columns: [] } },
        requiredColumns: { widget_facts: 'collection_run_id', [table]: 'collection_run_id' },
      });
      // A list that skipped `defineRequiredColumnCleanups` is checked again.
      const unchecked: RequiredColumnCleanup[] = [WIDGET_FACTS, { ...WIDGET_FACTS, table }];

      await expect(removeRowsBlockingRequiredColumns(db.tx as never, unchecked)).rejects.toThrow(/ADR-0010/);
      expect(db.statements).toEqual([]);
      expect(db.rowsOf(table)).toBe(9);
      expect(db.rowsOf('widget_facts')).toBe(3);
    }
  });

  it('refuses a delete that would cascade into, or null a reference in, a kept table, before any delete', async () => {
    const db = requiredColumnCleanupTransaction({
      tables: { widget_facts: { rows: 3, columns: [] } },
      requiredColumns: { widget_facts: 'collection_run_id' },
      reaches: [
        { listed_table: 'widget_facts', kept_table: 'channel_listing_option_inventory_components', action: 'c' },
        { listed_table: 'widget_facts', kept_table: 'orders', action: 'n' },
      ],
    });

    await expect(removeRowsBlockingRequiredColumns(db.tx as never, [WIDGET_FACTS])).rejects.toThrow(
      'Required-column cleanup refuses deletes that reach ADR-0010 kept tables: '
        + 'widget_facts -> channel_listing_option_inventory_components (on delete cascade), '
        + 'widget_facts -> orders (on delete set null).',
    );
    expect(db.reachLookups).toEqual([[['widget_facts'], KEPT_TABLES]]);
    expect(db.catalogLookups).toEqual([]);
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    expect(db.rowsOf('widget_facts')).toBe(3);
  });

  it('refuses a list it cannot run safely', () => {
    const invalid: Array<[string, RequiredColumnCleanup[]]> = [
      ['a table listed twice', [WIDGET_FACTS, { ...WIDGET_FACTS }]],
      ['an empty reason', [{ ...WIDGET_FACTS, reason: '  ' }]],
      ['a quoted table', [{ ...WIDGET_FACTS, table: '"widget_facts"' }]],
      ['a statement in a table name', [{ ...WIDGET_FACTS, table: 'widget_facts; DROP TABLE users' }]],
      ['an uppercase table', [{ ...WIDGET_FACTS, table: 'Widget_Facts' }]],
      ['a schema-qualified table', [{ ...WIDGET_FACTS, table: 'public.widget_facts' }]],
      ['a column with a space', [{ ...WIDGET_FACTS, requiredColumn: 'collection run_id' }]],
    ];
    for (const [label, cleanups] of invalid) {
      expect(() => assertRequiredColumnCleanups(cleanups), label).toThrow(/Required-column cleanup/);
      expect(() => defineRequiredColumnCleanups(cleanups), label).toThrow(/Required-column cleanup/);
    }
  });

  it('inlines a table only when the list names it and ADR-0010 does not keep it', () => {
    expect(requiredColumnCleanupTable('widget_facts', [WIDGET_FACTS]).sql).toBe('"widget_facts"');
    expect(() => requiredColumnCleanupTable('gadget_facts', [WIDGET_FACTS]))
      .toThrow(/Unexpected required-column cleanup table/);
    // Listed, yet kept by ADR-0010 or not a plain identifier.
    for (const table of ['orders', '"widget_facts"', 'widget_facts; DROP TABLE users']) {
      const listed = [WIDGET_FACTS, { ...WIDGET_FACTS, table }];
      expect(() => requiredColumnCleanupTable(table, listed), table)
        .toThrow(/Unexpected required-column cleanup table/);
    }
  });

  it('keeps the tables behind each ADR-0010 promise, as the schema declares them', () => {
    const adr = readText('docs/adr/0010-schema-cleanup-may-discard-office-data.md');
    const policy = readText('docs/runbooks/deployment-architecture.md');
    const promise = 'carry forward users and organizations, channel accounts, confirmed recipes, orders, and transport receipts';
    expect(adr).toContain(promise);
    expect(policy).toContain(promise);
    expect(Object.keys(ADR_0010_KEPT_TABLES)).toEqual([
      'users and organizations',
      'channel accounts',
      'confirmed recipes',
      'orders',
      'transport receipts',
    ]);

    const tables = modelTables();
    for (const table of KEPT_TABLES) expect(tables.has(table), table).toBe(true);
    expect(new Set(KEPT_TABLES).size).toBe(KEPT_TABLES.length);
    expect(tables.get('channel_listing_option_inventory_components')).toMatch(/@describe Confirmed /);
    expect(tables.get('coupang_direct_transport_receipts')).toMatch(/@describe Immutable transport effect receipt/);
  });
});
