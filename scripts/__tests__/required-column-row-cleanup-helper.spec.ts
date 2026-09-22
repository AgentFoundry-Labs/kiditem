import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADR_0010_KEPT_TABLES,
  assertOwnerApprovals,
  type DependentRowStep,
  type OwnerApprovalRecord,
} from '../data-migrations/helpers/dependent-row-removal';
import {
  approvalEntry,
  assertRequiredColumnCleanups,
  defineRequiredColumnCleanups,
  removeRowsBlockingRequiredColumns,
  type RequiredColumnCleanup,
  requiredColumnCleanupTable,
} from '../data-migrations/helpers/required-column-row-cleanup';
import { requiredColumnCleanupTransaction } from './fixtures/required-column-cleanup-transaction';

const repoRoot = join(__dirname, '..', '..');
const KEPT_TABLES: string[] = Object.values(ADR_0010_KEPT_TABLES).flat();
const APPROVAL: OwnerApprovalRecord = { by: 'release owner', at: '2026-09-17', scope: 'widget cutover impact inventory' };

/** A cleanup a later release might add: the helper needs only this entry. */
const WIDGET_FACTS: RequiredColumnCleanup = {
  table: 'widget_facts',
  requiredColumn: 'collection_run_id',
  reason: 'A later schema makes collection_run_id required, and old widget facts name no run.',
};

/**
 * A later release's attempt table: its readings, a reading that corrects
 * another, and the review a person made of a reading.
 */
const GADGET_RUNS: RequiredColumnCleanup = {
  table: 'gadget_runs',
  requiredColumn: 'attempt_plan_id',
  reason: 'A later schema reads a gadget run only through its attempt plan.',
  dependents: [
    { action: 'delete', table: 'gadget_reviews', column: 'reading_id', references: 'gadget_readings', kind: 'human-entered' },
    { action: 'delete', table: 'gadget_readings', column: 'corrects_reading_id', references: 'gadget_readings', kind: 'collected' },
    { action: 'delete', table: 'gadget_readings', column: 'run_id', references: 'gadget_runs', kind: 'collected' },
  ],
  ownerApproval: APPROVAL,
};

const GADGET_FOREIGN_KEYS = [
  { table: 'gadget_reviews', column: 'reading_id', references: 'gadget_readings' },
  { table: 'gadget_readings', column: 'corrects_reading_id', references: 'gadget_readings' },
  { table: 'gadget_readings', column: 'run_id', references: 'gadget_runs' },
];

function gadgetTables() {
  return {
    gadget_runs: { columns: ['id'], records: [{ id: 'run-old' }, { id: 'run-older' }] },
    gadget_readings: {
      columns: ['id', 'run_id', 'corrects_reading_id'],
      records: [
        { id: 'reading-1', run_id: 'run-old', corrects_reading_id: null },
        { id: 'reading-2', run_id: 'run-older', corrects_reading_id: null },
      ],
    },
    gadget_reviews: {
      columns: ['id', 'reading_id'],
      records: [
        { id: 'review-1', reading_id: 'reading-1' },
        { id: 'review-2', reading_id: 'reading-3' },
      ],
    },
  };
}

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
    // The reach check runs before the catalog lookup, and the foreign-key
    // check before every delete.
    expect(db.statements[0]).toMatch(/^WITH RECURSIVE deleted/);
    expect(db.statements[1]).toMatch(/AS required_column_present/);
    expect(db.statements[2]).toMatch(/FROM pg_constraint fk/);
    expect(db.foreignKeyLookups).toEqual([[['widget_facts']]]);
  });

  it('deletes dependent rows first, children before parents, following a self reference, and reports each table', async () => {
    const db = requiredColumnCleanupTransaction({
      tables: {
        ...gadgetTables(),
        gadget_readings: {
          columns: ['id', 'run_id', 'corrects_reading_id'],
          records: [
            { id: 'reading-1', run_id: 'run-old', corrects_reading_id: null },
            { id: 'reading-2', run_id: 'run-older', corrects_reading_id: null },
            // Only a correction points it at a deleted reading.
            { id: 'reading-3', run_id: 'run-kept-elsewhere', corrects_reading_id: 'reading-2' },
            { id: 'reading-4', run_id: 'run-kept-elsewhere', corrects_reading_id: 'reading-3' },
            { id: 'reading-5', run_id: 'run-kept-elsewhere', corrects_reading_id: null },
          ],
        },
      },
      requiredColumns: { gadget_runs: 'attempt_plan_id' },
      foreignKeys: GADGET_FOREIGN_KEYS,
    });

    await expect(removeRowsBlockingRequiredColumns(db.tx as never, [GADGET_RUNS])).resolves.toEqual({
      affectedRows: 8,
      details: {
        gadget_runs: {
          requiredColumn: 'attempt_plan_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 2,
          dependentRows: { gadget_reviews: 2, gadget_readings: 4 },
        },
      },
    });
    expect(db.deletes()).toEqual([
      'DELETE FROM "gadget_reviews" WHERE id = ANY($1::uuid[])',
      'DELETE FROM "gadget_readings" WHERE id = ANY($1::uuid[])',
      'DELETE FROM "gadget_runs"',
    ]);
    expect(db.idsOf('gadget_readings')).toEqual(['reading-5']);
    expect(db.idsOf('gadget_reviews')).toEqual([]);
    expect(db.reachLookups[0]?.[0]).toEqual(['gadget_runs', 'gadget_reviews', 'gadget_readings']);
  });

  it('skips a dependent step whose foreign key the database does not have', async () => {
    const db = requiredColumnCleanupTransaction({
      tables: gadgetTables(),
      requiredColumns: { gadget_runs: 'attempt_plan_id' },
      // The shape before the review table referenced readings.
      foreignKeys: GADGET_FOREIGN_KEYS.filter((foreignKey) => foreignKey.table !== 'gadget_reviews'),
    });

    await expect(removeRowsBlockingRequiredColumns(db.tx as never, [GADGET_RUNS])).resolves.toMatchObject({
      affectedRows: 4,
      details: { gadget_runs: { deletedRows: 2, dependentRows: { gadget_readings: 2 } } },
    });
    expect(db.rowsOf('gadget_reviews')).toBe(2);
  });

  it('refuses a foreign key into a deleted table that no dependent declares, before any delete', async () => {
    const db = requiredColumnCleanupTransaction({
      tables: { ...gadgetTables(), gadget_notes: { columns: ['id', 'reading_id'], rows: 1 } },
      requiredColumns: { gadget_runs: 'attempt_plan_id' },
      foreignKeys: [
        ...GADGET_FOREIGN_KEYS,
        { table: 'gadget_notes', column: 'reading_id', references: 'gadget_readings' },
      ],
    });

    await expect(removeRowsBlockingRequiredColumns(db.tx as never, [WIDGET_FACTS, GADGET_RUNS])).rejects.toThrow(
      'Required-column cleanup for gadget_runs refuses foreign keys its dependents do not declare: '
        + 'gadget_notes.reading_id -> gadget_readings.',
    );
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    expect(db.rowsOf('gadget_readings')).toBe(2);
  });

  it('refuses a foreign key into a listed table that declares no dependents', async () => {
    const db = requiredColumnCleanupTransaction({
      tables: { widget_facts: { rows: 3, columns: ['id'] }, widget_notes: { rows: 1, columns: ['id'] } },
      requiredColumns: { widget_facts: 'collection_run_id' },
      foreignKeys: [{ table: 'widget_notes', column: 'widget_fact_id', references: 'widget_facts' }],
    });

    await expect(removeRowsBlockingRequiredColumns(db.tx as never, [WIDGET_FACTS])).rejects.toThrow(
      'Required-column cleanup for widget_facts refuses foreign keys its dependents do not declare: '
        + 'widget_notes.widget_fact_id -> widget_facts.',
    );
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('unlinks a kept row that points at a deleted row, and stops on a kept row it cannot unlink', async () => {
    const kept: RequiredColumnCleanup = {
      ...GADGET_RUNS,
      dependents: [
        { action: 'unlink', table: 'orders', column: 'gadget_reading_id', references: 'gadget_readings', alsoClear: ['gadget_note'] },
        { action: 'delete', table: 'gadget_readings', column: 'run_id', references: 'gadget_runs', kind: 'human-entered' },
        { action: 'keep', table: 'coupang_direct_transport_receipts', column: 'gadget_run_id', references: 'gadget_runs' },
      ],
    };
    const foreignKeys = [
      { table: 'orders', column: 'gadget_reading_id', references: 'gadget_readings' },
      { table: 'gadget_readings', column: 'run_id', references: 'gadget_runs' },
      { table: 'coupang_direct_transport_receipts', column: 'gadget_run_id', references: 'gadget_runs' },
    ];
    const tables = (receiptRun: string) => ({
      gadget_runs: { columns: ['id'], records: [{ id: 'run-old' }] },
      gadget_readings: { columns: ['id', 'run_id'], records: [{ id: 'reading-1', run_id: 'run-old' }] },
      orders: {
        columns: ['id', 'gadget_reading_id', 'gadget_note'],
        records: [
          { id: 'order-1', gadget_reading_id: 'reading-1', gadget_note: 'cited' },
          { id: 'order-2', gadget_reading_id: null, gadget_note: 'other' },
        ],
      },
      coupang_direct_transport_receipts: {
        columns: ['id', 'gadget_run_id'],
        records: [{ id: 'receipt-1', gadget_run_id: receiptRun }],
      },
    });

    const blocked = requiredColumnCleanupTransaction({
      tables: tables('run-old'),
      requiredColumns: { gadget_runs: 'attempt_plan_id' },
      foreignKeys,
    });
    await expect(removeRowsBlockingRequiredColumns(blocked.tx as never, [kept])).rejects.toThrow(
      'Required-column cleanup for gadget_runs cannot delete rows that ADR-0010 kept rows reference: '
        + 'orders.gadget_reading_id (1), coupang_direct_transport_receipts.gadget_run_id (1).',
    );
    expect(blocked.tx.$executeRaw).not.toHaveBeenCalled();

    const db = requiredColumnCleanupTransaction({
      tables: tables('run-elsewhere'),
      requiredColumns: { gadget_runs: 'attempt_plan_id' },
      foreignKeys,
    });
    await expect(removeRowsBlockingRequiredColumns(db.tx as never, [kept])).resolves.toEqual({
      affectedRows: 3,
      details: {
        gadget_runs: {
          requiredColumn: 'attempt_plan_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 1,
          dependentRows: { gadget_readings: 1 },
          unlinkedRows: { 'orders.gadget_reading_id': 1 },
        },
      },
    });
    // The kept order stays, without the pointer; nothing is deleted from a kept table.
    expect(db.recordsOf('orders')).toEqual([
      { id: 'order-1', gadget_reading_id: null, gadget_note: null },
      { id: 'order-2', gadget_reading_id: null, gadget_note: 'other' },
    ]);
    expect(db.rowsOf('coupang_direct_transport_receipts')).toBe(1);
    expect(db.statements.filter((sql) => /^(DELETE|UPDATE)/.test(sql))).toEqual([
      'UPDATE "orders" SET "gadget_reading_id" = NULL, "gadget_note" = NULL WHERE "gadget_reading_id" = ANY($1::uuid[])',
      'DELETE FROM "gadget_readings" WHERE id = ANY($1::uuid[])',
      'DELETE FROM "gadget_runs"',
    ]);
  });

  it('stops at run start while an owner approval is pending, before any statement', async () => {
    const pending: RequiredColumnCleanup = { ...GADGET_RUNS, ownerApproval: 'pending' };
    const db = requiredColumnCleanupTransaction({
      tables: gadgetTables(),
      requiredColumns: { gadget_runs: 'attempt_plan_id' },
      foreignKeys: GADGET_FOREIGN_KEYS,
    });
    const message = "Row cleanup waits for the owner's approval of Required-column cleanup for gadget_runs "
      + '(deletes human-entered rows in gadget_reviews). Nothing was deleted.';

    expect(() => defineRequiredColumnCleanups([WIDGET_FACTS, pending])).not.toThrow();
    expect(() => assertOwnerApprovals([WIDGET_FACTS, pending].map(approvalEntry))).toThrow(message);
    await expect(removeRowsBlockingRequiredColumns(db.tx as never, [WIDGET_FACTS, pending])).rejects.toThrow(message);
    expect(db.statements).toEqual([]);
    expect(db.rowsOf('gadget_runs')).toBe(2);
    expect(() => assertOwnerApprovals([WIDGET_FACTS, GADGET_RUNS].map(approvalEntry))).not.toThrow();
  });

  it('needs an owner approval record exactly when a step deletes human-entered rows', () => {
    const { ownerApproval: _approval, ...unapproved } = GADGET_RUNS;
    expect(() => defineRequiredColumnCleanups([unapproved])).toThrow(
      'Required-column cleanup for gadget_runs deletes human-entered rows in gadget_reviews and needs ownerApproval.',
    );
    expect(() => defineRequiredColumnCleanups([{ ...WIDGET_FACTS, ownerApproval: APPROVAL }])).toThrow(
      'Required-column cleanup for widget_facts declares ownerApproval but deletes no human-entered rows.',
    );
    const collectedOnly: DependentRowStep[] = [
      { action: 'delete', table: 'gadget_readings', column: 'run_id', references: 'gadget_runs', kind: 'collected' },
    ];
    expect(() => defineRequiredColumnCleanups([{ ...GADGET_RUNS, dependents: collectedOnly }]))
      .toThrow(/declares ownerApproval/);
    expect(() => defineRequiredColumnCleanups([{ ...unapproved, dependents: collectedOnly }])).not.toThrow();
    for (const approval of [
      'approved',
      { ...APPROVAL, by: ' ' },
      { ...APPROVAL, at: '17 September 2026' },
      { ...APPROVAL, scope: '' },
    ]) {
      expect(() => assertRequiredColumnCleanups([{ ...GADGET_RUNS, ownerApproval: approval as never }]), JSON.stringify(approval))
        .toThrow("Required-column cleanup for gadget_runs needs ownerApproval 'pending' or { by, at: 'YYYY-MM-DD', scope }.");
    }
  });

  it('refuses every ADR-0010 kept table as a listed table or a delete step, whatever the approval', () => {
    expect(KEPT_TABLES.length).toBeGreaterThan(0);
    for (const table of KEPT_TABLES) {
      expect(
        () => defineRequiredColumnCleanups([WIDGET_FACTS, { ...WIDGET_FACTS, table }]),
        table,
      ).toThrow(`Required-column cleanup refuses ${table}: ADR-0010 carries its rows through every cutover.`);
      const deletesKept: RequiredColumnCleanup = {
        ...GADGET_RUNS,
        dependents: [{ action: 'delete', table, column: 'gadget_run_id', references: 'gadget_runs', kind: 'human-entered' }],
      };
      expect(() => defineRequiredColumnCleanups([deletesKept]), table)
        .toThrow(`Required-column cleanup for gadget_runs refuses ${table}: ADR-0010 carries its rows through every cutover.`);
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
    const step = (overrides: Record<string, unknown>) => ({
      ...GADGET_RUNS,
      dependents: [{
        action: 'delete', table: 'gadget_readings', column: 'run_id', references: 'gadget_runs', kind: 'human-entered',
        ...overrides,
      } as DependentRowStep],
    });
    const [reviews, , readings] = GADGET_RUNS.dependents!;
    const invalid: Array<[string, RequiredColumnCleanup[]]> = [
      ['a table listed twice', [WIDGET_FACTS, { ...WIDGET_FACTS }]],
      ['an empty reason', [{ ...WIDGET_FACTS, reason: '  ' }]],
      ['a quoted table', [{ ...WIDGET_FACTS, table: '"widget_facts"' }]],
      ['a statement in a table name', [{ ...WIDGET_FACTS, table: 'widget_facts; DROP TABLE users' }]],
      ['an uppercase table', [{ ...WIDGET_FACTS, table: 'Widget_Facts' }]],
      ['a schema-qualified table', [{ ...WIDGET_FACTS, table: 'public.widget_facts' }]],
      ['a column with a space', [{ ...WIDGET_FACTS, requiredColumn: 'collection run_id' }]],
      ['a quoted dependent column', [step({ column: '"run_id"' })]],
      ['an unknown action', [step({ action: 'truncate' })]],
      ['an unknown kind', [step({ kind: 'imported' })]],
      ['the listed table as its own dependent', [step({ table: 'gadget_runs' })]],
      ['a step listed twice', [{ ...GADGET_RUNS, dependents: [...GADGET_RUNS.dependents!, reviews!] }]],
      ['a parent deleted before its child', [{ ...GADGET_RUNS, dependents: [readings!, reviews!] }]],
      ['a reference to a table no step deletes', [step({ references: 'gadget_sites' })]],
      ['an unlink after the rows it points at go', [{
        ...GADGET_RUNS,
        dependents: [...GADGET_RUNS.dependents!, { action: 'unlink', table: 'orders', column: 'gadget_reading_id', references: 'gadget_readings' }],
      }]],
      ['a keep step on a table ADR-0010 does not keep', [{
        ...GADGET_RUNS,
        dependents: [...GADGET_RUNS.dependents!, { action: 'keep', table: 'gadget_notes', column: 'run_id', references: 'gadget_runs' }],
      }]],
      ['a quoted column to clear', [{
        ...GADGET_RUNS,
        dependents: [{ action: 'unlink', table: 'orders', column: 'gadget_run_id', references: 'gadget_runs', alsoClear: ['"note"'] }, ...GADGET_RUNS.dependents!],
      }]],
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

  it('freezes a defined list down to its dependent steps and approval', () => {
    const [defined] = defineRequiredColumnCleanups([{
      ...GADGET_RUNS,
      dependents: GADGET_RUNS.dependents!.map((dependent) => ({ ...dependent })),
      ownerApproval: { ...APPROVAL },
    }]);
    expect(Object.isFrozen(defined)).toBe(true);
    expect(Object.isFrozen(defined!.dependents)).toBe(true);
    expect(defined!.dependents!.every((dependent) => Object.isFrozen(dependent))).toBe(true);
    expect(Object.isFrozen(defined!.ownerApproval)).toBe(true);
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
