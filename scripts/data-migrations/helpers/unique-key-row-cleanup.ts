import { Prisma } from '@prisma/client';
import type { MigrationResult } from '../types';
import {
  activeDependentRowSteps,
  addCounts,
  applyDependentRowRemoval,
  type ApprovalEntry,
  assertDependentRowSteps,
  assertOwnerApprovalDeclared,
  assertOwnerApprovals,
  type DependentRowStep,
  foreignKeysInto,
  isPlainIdentifier,
  KEPT_TABLES,
  type OwnerApproval,
  planDependentRowRemoval,
  quotedIdentifier,
  type SqlClient,
  tablesDeletedBy,
  unique,
} from './dependent-row-removal';

/** One term of a partial index predicate, joined to the others with AND. */
export type UniqueKeyCondition =
  | { readonly column: string; readonly equals: string }
  | { readonly column: string; readonly isNotNull: true };

/**
 * A unique index the next schema adds to a table that already has rows, over
 * columns the table already has. `db push` cannot create it while two rows
 * that satisfy `where` share every key column, so the rows are reduced to one
 * survivor per key first: the newest `created_at`, then the highest `id`.
 *
 * Every other row of a key (a loser) goes with the rows that depend on it, as
 * `dependents` declares. When those rows reach an ADR-0010 kept table, the
 * loser is not removed: `neutralize` sets one predicate column to a value that
 * takes it out of the index. Without `neutralize`, kept rows are unlinked
 * where their reference is nullable, and a kept row that cannot be unlinked
 * stops the migration.
 */
export type UniqueKeyCleanup = {
  readonly table: string;
  /** The index `db push` creates. While it exists, the entry does nothing. */
  readonly index: string;
  /** The key columns, in index order. */
  readonly columns: readonly string[];
  /** The partial index predicate, in the schema's order; empty for a full index. */
  readonly where: readonly UniqueKeyCondition[];
  readonly neutralize?: { readonly column: string; readonly value: string };
  /** Why these rows may go or change instead of being kept. */
  readonly reason: string;
  /** Every foreign key into a table a loser's removal deletes from, in execution order. */
  readonly dependents?: readonly DependentRowStep[];
  /** Required exactly when a dependent step deletes human-entered rows. */
  readonly ownerApproval?: OwnerApproval;
};

export type UniqueKeyCleanupDetails = {
  table: string;
  tablePresent: boolean;
  indexPresent: boolean;
  duplicateGroups: number;
  /** Losers removed. */
  deletedRows: number;
  /** Losers kept and taken out of the index. */
  neutralizedRows: number;
  /** Rows removed with the losers, by table. */
  dependentRows: Record<string, number>;
  /** References cleared, by `table.column`. */
  unlinkedRows: Record<string, number>;
  /**
   * ADR-0010 kept rows that pointed at a loser, by `table.column`. A
   * neutralized loser keeps them; a removed loser leaves them unlinked.
   */
  keptReferences: Record<string, number>;
};

/** The columns every table this helper reads must have, for the survivor order. */
const SURVIVOR_ORDER_COLUMNS = ['id', 'created_at'] as const;
/** PostgreSQL truncates longer identifiers, so a longer index name cannot match. */
const MAX_IDENTIFIER_LENGTH = 63;

type PresenceRow = { index_name: string; table_present: boolean; index_present: boolean };
type ColumnRow = { table_name: string; column_name: string };
type RankedRow = { id: string; position: bigint | number };

/** Throws for a list this helper must not run: nothing has touched the database yet. */
export function assertUniqueKeyCleanups(cleanups: readonly UniqueKeyCleanup[]): void {
  const indexes = new Set<string>();
  for (const cleanup of cleanups) {
    const { table, index, columns, where, neutralize, reason } = cleanup;
    const names = [table, index, ...columns, ...where.map((term) => term.column)];
    if (!names.every(isPlainIdentifier) || index.length > MAX_IDENTIFIER_LENGTH) {
      throw new Error(`Unique-key cleanup needs plain lowercase identifiers, got ${JSON.stringify(`${table}.${index}`)}.`);
    }
    if (KEPT_TABLES.includes(table)) {
      throw new Error(`Unique-key cleanup refuses ${table}: ADR-0010 carries its rows through every cutover.`);
    }
    if (indexes.has(index)) {
      throw new Error(`Unique-key cleanup lists ${index} more than once.`);
    }
    if (columns.length === 0 || new Set(columns).size !== columns.length) {
      throw new Error(`Unique-key cleanup for ${index} needs distinct key columns.`);
    }
    for (const term of where) {
      const equals = 'equals' in term ? term.equals : undefined;
      const isNotNull = 'isNotNull' in term ? term.isNotNull : undefined;
      if ((equals === undefined) === (isNotNull === undefined)
        || (equals !== undefined && (typeof equals !== 'string' || equals === ''))
        || (isNotNull !== undefined && isNotNull !== true)) {
        throw new Error(`Unique-key cleanup for ${index} has a predicate term it cannot read on ${term.column}.`);
      }
    }
    if (neutralize) {
      const matched = where.find((term) => term.column === neutralize.column && 'equals' in term);
      if (!isPlainIdentifier(neutralize.column)
        || !matched
        || !('equals' in matched)
        || typeof neutralize.value !== 'string'
        || neutralize.value === ''
        || neutralize.value === matched.equals) {
        throw new Error(
          `Unique-key cleanup for ${index} can only neutralize a column its predicate compares, `
            + 'with a value the predicate does not accept.',
        );
      }
    }
    if (reason.trim() === '') {
      throw new Error(`Unique-key cleanup for ${index} needs a reason.`);
    }
    assertDependentRowSteps(`Unique-key cleanup for ${index}`, table, cleanup.dependents);
    assertOwnerApprovalDeclared(approvalEntry(cleanup));
    indexes.add(index);
  }
}

/** Checks a migration's list when its module loads. */
export function defineUniqueKeyCleanups<const T extends readonly UniqueKeyCleanup[]>(cleanups: T): T {
  assertUniqueKeyCleanups(cleanups);
  for (const cleanup of cleanups) {
    Object.freeze(cleanup.columns);
    for (const term of cleanup.where) Object.freeze(term);
    Object.freeze(cleanup.where);
    if (cleanup.neutralize) Object.freeze(cleanup.neutralize);
    for (const step of cleanup.dependents ?? []) {
      if (step.action === 'unlink' && step.alsoClear) Object.freeze(step.alsoClear);
      Object.freeze(step);
    }
    if (cleanup.dependents) Object.freeze(cleanup.dependents);
    if (typeof cleanup.ownerApproval === 'object') Object.freeze(cleanup.ownerApproval);
    Object.freeze(cleanup);
  }
  Object.freeze(cleanups);
  return cleanups;
}

/** The entry as the owner-approval gate reads it. */
export function approvalEntry(cleanup: UniqueKeyCleanup): ApprovalEntry {
  return {
    label: `Unique-key cleanup for ${cleanup.index}`,
    dependents: cleanup.dependents,
    ownerApproval: cleanup.ownerApproval,
  };
}

/** The predicate as the Prisma schema spells it in `where: raw(...)`. */
export function uniqueKeyPredicateText(cleanup: UniqueKeyCleanup): string {
  return cleanup.where
    .map((term) => ('equals' in term
      ? `${term.column} = '${term.equals.replaceAll("'", "''")}'`
      : `${term.column} IS NOT NULL`))
    .join(' AND ');
}

/**
 * Reduces each listed key to one row per value before `db push` creates its
 * index, for a pre-schema migration under the data-loss policy (ADR-0010).
 *
 * - A pending owner approval stops the run before any statement.
 * - A table the database does not have is skipped, and so is an entry whose
 *   index already exists: a run after `db push` affects no rows.
 * - A key column, predicate column, or survivor-order column the table lacks,
 *   and a foreign key into a table a removal deletes from that `dependents`
 *   does not declare, stop the run before any change.
 * - Entries run in list order, each against the rows the earlier ones left,
 *   and losers one at a time in id order.
 *
 * Details are keyed by index, in list order. `affectedRows` counts removed,
 * neutralized, dependent, and unlinked rows.
 */
export async function removeRowsBlockingUniqueKeys(
  tx: SqlClient,
  cleanups: readonly UniqueKeyCleanup[],
): Promise<MigrationResult> {
  assertUniqueKeyCleanups(cleanups);
  assertOwnerApprovals(cleanups.map(approvalEntry));
  const details: Record<string, UniqueKeyCleanupDetails> = {};
  if (cleanups.length === 0) return { affectedRows: 0, details };

  const presence = await tx.$queryRaw<PresenceRow[]>`
    SELECT
      entry.index_name,
      EXISTS (
        SELECT 1
        FROM pg_class t
        WHERE t.relnamespace = to_regnamespace(current_schema())
          AND t.relkind IN ('r', 'p')
          AND t.relname::text = entry.table_name
      ) AS table_present,
      EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        WHERE t.relnamespace = to_regnamespace(current_schema())
          AND t.relname::text = entry.table_name
          AND ic.relname::text = entry.index_name
          AND i.indisunique
          AND i.indisvalid
      ) AS index_present
    FROM unnest(${cleanups.map((cleanup) => cleanup.table)}::text[], ${cleanups.map((cleanup) => cleanup.index)}::text[])
      AS entry(table_name, index_name)
  `;
  const presenceByIndex = new Map(presence.map((row) => [row.index_name, row]));
  const pending = cleanups.filter((cleanup) => {
    const row = presenceByIndex.get(cleanup.index);
    return row?.table_present === true && row.index_present !== true;
  });

  // Every refusal the catalog can give comes before the first change.
  const activeSteps = new Map<string, DependentRowStep[]>();
  if (pending.length > 0) {
    const columnRows = await tx.$queryRaw<ColumnRow[]>`
      SELECT table_name::text AS table_name, column_name::text AS column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name::text = ANY(${unique(pending.map((cleanup) => cleanup.table))}::text[])
    `;
    const present = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
    const missing = pending.flatMap((cleanup) => entryColumns(cleanup)
      .filter((column) => !present.has(`${cleanup.table}.${column}`))
      .map((column) => `${cleanup.index} needs ${cleanup.table}.${column}`));
    if (missing.length > 0) {
      throw new Error(`Unique-key cleanup cannot read ${missing.join(', ')}.`);
    }
    const foreignKeys = await foreignKeysInto(
      tx,
      unique(pending.flatMap((cleanup) => tablesDeletedBy(cleanup.table, cleanup.dependents))),
    );
    for (const cleanup of pending) {
      activeSteps.set(cleanup.index, activeDependentRowSteps(
        `Unique-key cleanup for ${cleanup.index}`,
        cleanup.table,
        cleanup.dependents,
        foreignKeys,
      ));
    }
  }

  let affectedRows = 0;
  for (const cleanup of cleanups) {
    const row = presenceByIndex.get(cleanup.index);
    const tablePresent = row?.table_present === true;
    const indexPresent = tablePresent && row?.index_present === true;
    const entry: UniqueKeyCleanupDetails = {
      table: cleanup.table,
      tablePresent,
      indexPresent,
      duplicateGroups: 0,
      deletedRows: 0,
      neutralizedRows: 0,
      dependentRows: {},
      unlinkedRows: {},
      keptReferences: {},
    };
    details[cleanup.index] = entry;
    if (!tablePresent || indexPresent) continue;

    const table = quotedIdentifier(cleanup.table);
    const key = Prisma.join(cleanup.columns.map((column) => Prisma.sql`t.${quotedIdentifier(column)}`), ', ');
    const ranked = await tx.$queryRaw<RankedRow[]>`
      SELECT id, position
      FROM (
        SELECT
          t.id::text AS id,
          row_number() OVER (PARTITION BY ${key} ORDER BY t.created_at DESC, t.id DESC) AS position,
          count(*) OVER (PARTITION BY ${key}) AS group_size
        FROM ${table} t
        WHERE ${predicate(cleanup)}
      ) ranked
      WHERE group_size > 1
      ORDER BY id
    `;
    entry.duplicateGroups = ranked.filter((rankedRow) => Number(rankedRow.position) === 1).length;
    const losers = ranked.filter((rankedRow) => Number(rankedRow.position) > 1).map((rankedRow) => rankedRow.id);
    const steps = activeSteps.get(cleanup.index) ?? [];

    for (const loser of losers) {
      const plan = await planDependentRowRemoval(tx, cleanup.table, [loser], steps);
      const reachesKept = Object.keys(plan.keptReferences).length > 0;
      if (reachesKept && cleanup.neutralize) {
        entry.neutralizedRows += await tx.$executeRaw`
          UPDATE ${table}
          SET ${quotedIdentifier(cleanup.neutralize.column)} = ${cleanup.neutralize.value}
          WHERE id = ANY(${[loser]}::uuid[])
        `;
        addCounts(entry.keptReferences, plan.keptReferences);
        continue;
      }
      if (plan.blocked) {
        throw new Error(
          `Unique-key cleanup for ${cleanup.index} cannot remove a duplicate row that ADR-0010 kept rows `
            + `reference: ${Object.entries(plan.keptReferences).map(([link, rows]) => `${link} (${rows})`).join(', ')}. `
            + "The migration's transaction rolls back.",
        );
      }
      const counts = await applyDependentRowRemoval(tx, plan, steps);
      addCounts(entry.keptReferences, plan.keptReferences);
      addCounts(entry.dependentRows, counts.dependentRows);
      addCounts(entry.unlinkedRows, counts.unlinkedRows);
      entry.deletedRows += await tx.$executeRaw`
        DELETE FROM ${table}
        WHERE id = ANY(${[loser]}::uuid[])
      `;
    }
    affectedRows += entry.deletedRows + entry.neutralizedRows
      + sum(entry.dependentRows) + sum(entry.unlinkedRows);
  }

  return { affectedRows, details };
}

/** Rows the index covers: every key column is set, and the predicate holds. */
function predicate(cleanup: UniqueKeyCleanup): Prisma.Sql {
  const terms = [
    ...cleanup.columns.map((column) => Prisma.sql`t.${quotedIdentifier(column)} IS NOT NULL`),
    ...cleanup.where.map((term) => ('equals' in term
      ? Prisma.sql`t.${quotedIdentifier(term.column)} = ${term.equals}`
      : Prisma.sql`t.${quotedIdentifier(term.column)} IS NOT NULL`)),
  ];
  return Prisma.join(terms, ' AND ');
}

function entryColumns(cleanup: UniqueKeyCleanup): string[] {
  return unique([
    ...SURVIVOR_ORDER_COLUMNS,
    ...cleanup.columns,
    ...cleanup.where.map((term) => term.column),
    ...(cleanup.neutralize ? [cleanup.neutralize.column] : []),
  ]);
}

function sum(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}
