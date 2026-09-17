import { describe, expect, it } from 'vitest';
import {
  ADR_0010_KEPT_TABLES,
  type DependentRowStep,
  type OwnerApprovalRecord,
} from '../data-migrations/helpers/dependent-row-removal';
import {
  assertUniqueKeyCleanups,
  defineUniqueKeyCleanups,
  removeRowsBlockingUniqueKeys,
  type UniqueKeyCleanup,
  uniqueKeyPredicateText,
} from '../data-migrations/helpers/unique-key-row-cleanup';
import {
  type FakeRankedRow,
  requiredColumnCleanupTransaction,
} from './fixtures/required-column-cleanup-transaction';

const APPROVAL: OwnerApprovalRecord = { by: 'release owner', at: '2026-09-17', scope: 'widget cutover impact inventory' };

/**
 * What a widget sync takes with it: its logs go, a kept order loses its
 * pointer, and a kept consumption that cites it keeps it.
 */
const SYNC_DEPENDENTS: readonly DependentRowStep[] = [
  { action: 'delete', table: 'widget_sync_logs', column: 'sync_id', references: 'widget_syncs', kind: 'collected' },
  { action: 'unlink', table: 'orders', column: 'widget_sync_id', references: 'widget_syncs' },
  { action: 'keep', table: 'coupang_direct_transport_consumptions', column: 'widget_sync_id', references: 'widget_syncs' },
];

/** A later release's key: one running widget sync per account. */
const RUNNING_SYNC: UniqueKeyCleanup = {
  table: 'widget_syncs',
  index: 'widget_syncs_running_key',
  columns: ['organization_id', 'account_id'],
  where: [{ column: 'kind', equals: 'widget' }, { column: 'status', equals: 'running' }],
  neutralize: { column: 'status', value: 'failed' },
  reason: 'A later schema allows one running widget sync per account.',
  dependents: SYNC_DEPENDENTS,
};

/** A later release's key: one widget sync per numbered generation. */
const SYNC_GENERATION: UniqueKeyCleanup = {
  table: 'widget_syncs',
  index: 'widget_syncs_generation_key',
  columns: ['organization_id', 'account_id', 'generation'],
  where: [{ column: 'generation', isNotNull: true }],
  reason: 'A later schema numbers widget syncs per account.',
  dependents: SYNC_DEPENDENTS,
};

const SYNC_COLUMNS = ['id', 'created_at', 'organization_id', 'account_id', 'kind', 'status', 'generation'];
const SYNC_FOREIGN_KEYS = SYNC_DEPENDENTS.map(({ table, column, references }) => ({ table, column, references }));

function syncs(overrides: {
  indexes?: string[];
  columns?: string[];
  ranked?: FakeRankedRow[][];
  consumptionSync?: string;
} = {}) {
  return requiredColumnCleanupTransaction({
    tables: {
      widget_syncs: {
        columns: overrides.columns ?? SYNC_COLUMNS,
        records: ['sync-new', 'sync-logged', 'sync-ordered', 'sync-gen-new', 'sync-gen-ordered']
          .map((id) => ({ id, status: 'running' })),
      },
      widget_sync_logs: {
        columns: ['id', 'sync_id'],
        records: [{ id: 'log-1', sync_id: 'sync-logged' }, { id: 'log-2', sync_id: 'sync-new' }],
      },
      orders: {
        columns: ['id', 'widget_sync_id'],
        records: [{ id: 'order-1', widget_sync_id: 'sync-ordered' }, { id: 'order-2', widget_sync_id: 'sync-gen-ordered' }],
      },
      coupang_direct_transport_consumptions: {
        columns: ['id', 'widget_sync_id'],
        records: [{ id: 'consumption-1', widget_sync_id: overrides.consumptionSync ?? 'sync-new' }],
      },
    },
    requiredColumns: {},
    indexes: overrides.indexes,
    ranked: overrides.ranked,
    foreignKeys: SYNC_FOREIGN_KEYS,
  });
}

const untouched = {
  tablePresent: true,
  indexPresent: false,
  duplicateGroups: 0,
  deletedRows: 0,
  neutralizedRows: 0,
  dependentRows: {},
  unlinkedRows: {},
  keptReferences: {},
};

describe('unique-key row cleanup helper', () => {
  it('keeps the newest row of each key, removes a loser with its dependents, and takes one kept rows cite out of the index', async () => {
    const db = syncs({
      ranked: [
        [
          { id: 'sync-new', position: 1 },
          { id: 'sync-logged', position: 2 },
          { id: 'sync-ordered', position: 3 },
        ],
        [
          { id: 'sync-gen-new', position: 1 },
          { id: 'sync-gen-ordered', position: 2 },
        ],
      ],
    });

    await expect(removeRowsBlockingUniqueKeys(db.tx as never, [RUNNING_SYNC, SYNC_GENERATION])).resolves.toEqual({
      affectedRows: 5,
      details: {
        widget_syncs_running_key: {
          ...untouched,
          table: 'widget_syncs',
          duplicateGroups: 1,
          deletedRows: 1,
          neutralizedRows: 1,
          dependentRows: { widget_sync_logs: 1 },
          keptReferences: { 'orders.widget_sync_id': 1 },
        },
        // Without a neutral value, the kept order loses its pointer instead.
        widget_syncs_generation_key: {
          ...untouched,
          table: 'widget_syncs',
          duplicateGroups: 1,
          deletedRows: 1,
          unlinkedRows: { 'orders.widget_sync_id': 1 },
          keptReferences: { 'orders.widget_sync_id': 1 },
        },
      },
    });
    expect(db.idsOf('widget_syncs')).toEqual(['sync-new', 'sync-ordered', 'sync-gen-new']);
    expect(db.recordsOf('widget_syncs')?.find((record) => record.id === 'sync-ordered')?.status).toBe('failed');
    expect(db.idsOf('widget_sync_logs')).toEqual(['log-2']);
    expect(db.recordsOf('orders')).toEqual([
      { id: 'order-1', widget_sync_id: 'sync-ordered' },
      { id: 'order-2', widget_sync_id: null },
    ]);
    expect(db.rowsOf('coupang_direct_transport_consumptions')).toBe(1);
    const unlinkOrders = 'UPDATE "orders" SET "widget_sync_id" = NULL WHERE "widget_sync_id" = ANY($1::uuid[])';
    expect(db.statements.filter((sql) => /^(DELETE|UPDATE)/.test(sql))).toEqual([
      // The logged loser: its logs, the (empty) order unlink, then the row.
      'DELETE FROM "widget_sync_logs" WHERE id = ANY($1::uuid[])',
      unlinkOrders,
      'DELETE FROM "widget_syncs" WHERE id = ANY($1::uuid[])',
      // The ordered loser is only marked failed.
      'UPDATE "widget_syncs" SET "status" = $1 WHERE id = ANY($2::uuid[])',
      // The generation loser: the order unlink, then the row.
      unlinkOrders,
      'DELETE FROM "widget_syncs" WHERE id = ANY($1::uuid[])',
    ]);

    // The ranking reads rows the index would cover, newest first per key.
    const ranking = db.statements.find((sql) => sql.includes('row_number() OVER'))!;
    expect(ranking).toContain(
      'row_number() OVER (PARTITION BY t."organization_id", t."account_id" ORDER BY t.created_at DESC, t.id DESC)',
    );
    expect(ranking).toContain(
      'WHERE t."organization_id" IS NOT NULL AND t."account_id" IS NOT NULL AND t."kind" = $1 AND t."status" = $2',
    );
    // One foreign-key lookup for every table the removals could reach.
    expect(db.foreignKeyLookups).toEqual([[['widget_syncs', 'widget_sync_logs']]]);
  });

  it('stops on a loser that a kept row cites and cannot be unlinked from, when the key has no neutral value', async () => {
    const db = syncs({
      consumptionSync: 'sync-gen-ordered',
      ranked: [[{ id: 'sync-gen-new', position: 1 }, { id: 'sync-gen-ordered', position: 2 }]],
    });

    await expect(removeRowsBlockingUniqueKeys(db.tx as never, [SYNC_GENERATION])).rejects.toThrow(
      'Unique-key cleanup for widget_syncs_generation_key cannot remove a duplicate row that ADR-0010 kept rows '
        + "reference: orders.widget_sync_id (1), coupang_direct_transport_consumptions.widget_sync_id (1). "
        + "The migration's transaction rolls back.",
    );
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('marks a running loser failed when a kept row that cannot be unlinked cites it', async () => {
    const db = syncs({
      consumptionSync: 'sync-logged',
      ranked: [[{ id: 'sync-new', position: 1 }, { id: 'sync-logged', position: 2 }]],
    });

    await expect(removeRowsBlockingUniqueKeys(db.tx as never, [RUNNING_SYNC])).resolves.toMatchObject({
      affectedRows: 1,
      details: {
        widget_syncs_running_key: {
          deletedRows: 0,
          neutralizedRows: 1,
          dependentRows: {},
          keptReferences: { 'coupang_direct_transport_consumptions.widget_sync_id': 1 },
        },
      },
    });
    // The loser keeps its logs, as it keeps the consumption.
    expect(db.rowsOf('widget_sync_logs')).toBe(2);
  });
  it('reads no rows for a missing table or an index that already exists', async () => {
    const missingTable: UniqueKeyCleanup = {
      ...SYNC_GENERATION,
      table: 'gadget_syncs',
      index: 'gadget_syncs_generation_key',
      dependents: undefined,
    };
    const db = syncs({ indexes: ['widget_syncs_running_key', 'widget_syncs_generation_key'] });

    const result = await removeRowsBlockingUniqueKeys(db.tx as never, [RUNNING_SYNC, SYNC_GENERATION, missingTable]);

    expect(result.affectedRows).toBe(0);
    expect(result.details).toEqual({
      widget_syncs_running_key: { ...untouched, table: 'widget_syncs', indexPresent: true },
      widget_syncs_generation_key: { ...untouched, table: 'widget_syncs', indexPresent: true },
      gadget_syncs_generation_key: { ...untouched, table: 'gadget_syncs', tablePresent: false },
    });
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]).toMatch(/AS index_present/);
  });

  it('stops before any change when a table lacks a column an entry reads, or a foreign key no step declares', async () => {
    const missing = syncs({
      columns: SYNC_COLUMNS.filter((column) => column !== 'generation' && column !== 'created_at'),
      ranked: [[{ id: 'sync-new', position: 1 }, { id: 'sync-logged', position: 2 }]],
    });
    await expect(removeRowsBlockingUniqueKeys(missing.tx as never, [RUNNING_SYNC, SYNC_GENERATION])).rejects.toThrow(
      'Unique-key cleanup cannot read widget_syncs_running_key needs widget_syncs.created_at, '
        + 'widget_syncs_generation_key needs widget_syncs.created_at, '
        + 'widget_syncs_generation_key needs widget_syncs.generation.',
    );
    expect(missing.statements.some((sql) => sql.includes('row_number()'))).toBe(false);
    expect(missing.tx.$executeRaw).not.toHaveBeenCalled();

    const undeclared = syncs({ ranked: [[{ id: 'sync-new', position: 1 }, { id: 'sync-logged', position: 2 }]] });
    const withoutLogs: UniqueKeyCleanup = { ...RUNNING_SYNC, dependents: SYNC_DEPENDENTS.slice(1) };
    await expect(removeRowsBlockingUniqueKeys(undeclared.tx as never, [withoutLogs])).rejects.toThrow(
      'Unique-key cleanup for widget_syncs_running_key refuses foreign keys its dependents do not declare: '
        + 'widget_sync_logs.sync_id -> widget_syncs.',
    );
    expect(undeclared.statements.some((sql) => sql.includes('row_number()'))).toBe(false);
  });

  it('stops at run start while an owner approval is pending, before any statement', async () => {
    const confirmations: readonly DependentRowStep[] = [
      { action: 'delete', table: 'widget_sync_logs', column: 'sync_id', references: 'widget_syncs', kind: 'human-entered' },
      ...SYNC_DEPENDENTS.slice(1),
    ];
    const db = syncs();

    await expect(removeRowsBlockingUniqueKeys(db.tx as never, [
      { ...SYNC_GENERATION, dependents: confirmations, ownerApproval: 'pending' },
    ])).rejects.toThrow(
      "Row cleanup waits for the owner's approval of Unique-key cleanup for widget_syncs_generation_key "
        + '(deletes human-entered rows in widget_sync_logs). Nothing was deleted.',
    );
    expect(db.statements).toEqual([]);
    expect(() => defineUniqueKeyCleanups([{ ...SYNC_GENERATION, dependents: confirmations }])).toThrow(
      'Unique-key cleanup for widget_syncs_generation_key deletes human-entered rows in widget_sync_logs and needs ownerApproval.',
    );
    expect(() => defineUniqueKeyCleanups([{ ...SYNC_GENERATION, dependents: confirmations, ownerApproval: APPROVAL }]))
      .not.toThrow();
  });

  it('spells a predicate the way the Prisma schema does', () => {
    expect(uniqueKeyPredicateText(RUNNING_SYNC)).toBe("kind = 'widget' AND status = 'running'");
    expect(uniqueKeyPredicateText(SYNC_GENERATION)).toBe('generation IS NOT NULL');
    expect(uniqueKeyPredicateText({ ...SYNC_GENERATION, where: [{ column: 'kind', equals: "o'clock" }] }))
      .toBe("kind = 'o''clock'");
  });

  it('refuses a list it cannot run safely', () => {
    const invalid: Array<[string, UniqueKeyCleanup[]]> = [
      ['an index listed twice', [RUNNING_SYNC, { ...RUNNING_SYNC }]],
      ['an empty reason', [{ ...RUNNING_SYNC, reason: ' ' }]],
      ['a quoted table', [{ ...RUNNING_SYNC, table: '"widget_syncs"' }]],
      ['an index name PostgreSQL would truncate', [{ ...RUNNING_SYNC, index: `widget_${'x'.repeat(60)}` }]],
      ['no key columns', [{ ...RUNNING_SYNC, columns: [] }]],
      ['a key column listed twice', [{ ...RUNNING_SYNC, columns: ['account_id', 'account_id'] }]],
      ['a statement in a key column', [{ ...RUNNING_SYNC, columns: ['account_id; DROP TABLE users'] }]],
      ['a predicate term with both forms', [{ ...RUNNING_SYNC, where: [{ column: 'kind', equals: 'widget', isNotNull: true } as never] }]],
      ['a predicate term with neither form', [{ ...RUNNING_SYNC, where: [{ column: 'kind' } as never] }]],
      ['an empty compared value', [{ ...RUNNING_SYNC, where: [{ column: 'kind', equals: '' }] }]],
      ['a neutralized column the predicate does not compare', [{ ...RUNNING_SYNC, neutralize: { column: 'kind', value: 'gadget' }, where: [{ column: 'status', equals: 'running' }] }]],
      ['a neutral value the predicate accepts', [{ ...RUNNING_SYNC, neutralize: { column: 'status', value: 'running' } }]],
      ['a neutralized column the predicate only requires', [{ ...SYNC_GENERATION, neutralize: { column: 'generation', value: '0' } }]],
      ['a delete step on a kept table', [{
        ...SYNC_GENERATION,
        dependents: [{ action: 'delete', table: 'orders', column: 'widget_sync_id', references: 'widget_syncs', kind: 'collected' }],
      }]],
      ['a dependent step out of order', [{
        ...SYNC_GENERATION,
        dependents: [
          { action: 'delete', table: 'widget_sync_logs', column: 'sync_id', references: 'widget_syncs', kind: 'collected' },
          { action: 'delete', table: 'widget_sync_notes', column: 'log_id', references: 'widget_sync_logs', kind: 'collected' },
        ],
      }]],
      ['an approval with nothing human-entered to approve', [{ ...SYNC_GENERATION, ownerApproval: APPROVAL }]],
    ];
    for (const [label, cleanups] of invalid) {
      expect(() => assertUniqueKeyCleanups(cleanups), label).toThrow(/Unique-key cleanup/);
      expect(() => defineUniqueKeyCleanups(cleanups), label).toThrow(/Unique-key cleanup/);
    }
    for (const table of Object.values(ADR_0010_KEPT_TABLES).flat()) {
      expect(() => defineUniqueKeyCleanups([{ ...SYNC_GENERATION, table, dependents: undefined }]), table)
        .toThrow(`Unique-key cleanup refuses ${table}: ADR-0010 carries its rows through every cutover.`);
    }
  });

  it('freezes a defined list', () => {
    const [defined] = defineUniqueKeyCleanups([{
      ...RUNNING_SYNC,
      columns: [...RUNNING_SYNC.columns],
      where: RUNNING_SYNC.where.map((term) => ({ ...term })),
      neutralize: { ...RUNNING_SYNC.neutralize! },
      dependents: SYNC_DEPENDENTS.map((step) => ({ ...step })),
    }]);
    expect(Object.isFrozen(defined)).toBe(true);
    expect(Object.isFrozen(defined!.columns)).toBe(true);
    expect(defined!.where.every((term) => Object.isFrozen(term))).toBe(true);
    expect(Object.isFrozen(defined!.neutralize)).toBe(true);
    expect(defined!.dependents!.every((step) => Object.isFrozen(step))).toBe(true);
  });
});
