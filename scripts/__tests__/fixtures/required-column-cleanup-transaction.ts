import { Prisma } from '@prisma/client';
import { vi } from 'vitest';

type RecordValue = string | null;
type FakeRecord = { id: string } & Record<string, RecordValue>;

/**
 * One table as the database holds it: its columns, and either a row count or
 * the rows themselves when a test follows references between tables.
 */
export type FakeTableState = {
  rows?: number;
  records?: readonly FakeRecord[];
  columns: readonly string[];
};

/** A row of the helper's kept-table reach query. */
export type FakeKeptTableReach = { listed_table: string; kept_table: string; action: string };

/** A foreign key the fake catalog reports: `column` points at `references.id`, paired with organization_id. */
export type FakeForeignKey = { table: string; column: string; references: string };

/** A row of the unique-key ranking query. */
export type FakeRankedRow = { id: string; position: number };

/**
 * A transaction for the v0.1.31:014 helpers. SQL is rendered by Prisma itself,
 * so a listed identifier arrives inline and catalog inputs and ids arrive as
 * bound values.
 *
 * - The kept-table reach query answers with `reaches`.
 * - The shape catalog answers for the table and column pairs it was asked
 *   about and, like a careless catalog, for every `unrequested` table too.
 * - The foreign-key catalog answers with `foreignKeys` into the asked tables
 *   whose child table the database has.
 * - Id selections, counts, unlinks, and deletes follow `records`.
 * - The unique-key queries answer from `indexes` and `ranked` (in call order).
 * - Like PostgreSQL, a statement on a table the database does not have fails.
 *   Like the schema step, a whole-table delete from a table that already has
 *   the column it was listed for fails, so a passing run proves the helper
 *   never reached for either.
 */
export function requiredColumnCleanupTransaction(options: {
  tables: Record<string, FakeTableState>;
  requiredColumns: Readonly<Record<string, string>>;
  unrequested?: Record<string, FakeTableState>;
  reaches?: FakeKeptTableReach[];
  foreignKeys?: readonly FakeForeignKey[];
  indexes?: readonly string[];
  ranked?: readonly FakeRankedRow[][];
}) {
  const unrequested = options.unrequested ?? {};
  const state = new Map(Object.entries({ ...options.tables, ...unrequested }).map(([table, value]) => [
    table,
    {
      columns: value.columns,
      records: [...(value.records ?? Array.from({ length: value.rows ?? 0 }, (_, index) => ({ id: `${table}-${index + 1}` })))],
    },
  ]));
  const rankedAnswers = [...(options.ranked ?? [])];
  const statements: string[] = [];
  const reachLookups: unknown[][] = [];
  const catalogLookups: unknown[][] = [];
  const foreignKeyLookups: unknown[][] = [];
  const updates: Array<{ table: string; set: Record<string, unknown>; ids: string[] }> = [];
  // `text` numbers the placeholders, so a term can find its bound value.
  const render = (strings: TemplateStringsArray, values: unknown[]) => {
    const query = Prisma.sql(strings, ...values);
    return { sql: query.text.replace(/\s+/g, ' ').trim(), values: query.values };
  };
  const table = (name: string) => {
    const current = state.get(name);
    if (!current) throw new Error(`relation "${name}" does not exist`);
    return current;
  };
  const bound = (values: unknown[], placeholder: string) => values[Number(placeholder) - 1] as string[];

  return {
    statements,
    reachLookups,
    catalogLookups,
    foreignKeyLookups,
    updates,
    deletes: () => statements.filter((sql) => sql.startsWith('DELETE')),
    rowsOf: (name: string) => state.get(name)?.records.length,
    idsOf: (name: string) => state.get(name)?.records.map((record) => record.id),
    recordsOf: (name: string) => state.get(name)?.records,
    tx: {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql, values: params } = render(strings, values);
        statements.push(sql);
        if (sql.startsWith('WITH RECURSIVE deleted')) {
          reachLookups.push(params);
          return options.reaches ?? [];
        }
        if (sql.includes('AS required_column_present')) {
          catalogLookups.push(params);
          const [requestedTables, requestedColumns] = params as [string[], string[]];
          const rows = requestedTables.map((name, index) => ({
            table_name: name,
            table_present: state.has(name),
            required_column_present: state.get(name)?.columns.includes(requestedColumns[index]!) ?? false,
          }));
          for (const name of Object.keys(unrequested)) {
            rows.push({ table_name: name, table_present: true, required_column_present: false });
          }
          return rows;
        }
        if (sql.includes('FROM pg_constraint fk')) {
          foreignKeyLookups.push(params);
          const [parents] = params as [string[]];
          return (options.foreignKeys ?? [])
            .filter((foreignKey) => parents.includes(foreignKey.references) && state.has(foreignKey.table))
            .map((foreignKey) => ({
              child_table: foreignKey.table,
              parent_table: foreignKey.references,
              constraint_name: `${foreignKey.table}_${foreignKey.column}_fkey`,
              child_columns: [foreignKey.column, 'organization_id'],
              parent_columns: ['id', 'organization_id'],
            }));
        }
        const all = sql.match(/^SELECT id::text AS id FROM "([a-z0-9_]+)"$/);
        if (all) return table(all[1]!).records.map((record) => ({ id: record.id }));
        const pointing = sql.match(/^SELECT t\.id::text AS id FROM "([a-z0-9_]+)" t WHERE (.+)$/);
        if (pointing) {
          const terms = [...pointing[2]!.matchAll(/t\."([a-z0-9_]+)" = ANY\(\$(\d+)::uuid\[\]\)/g)]
            .map((term) => ({ column: term[1]!, ids: bound(params, term[2]!) }));
          const excluded = pointing[2]!.match(/AND NOT \(t\.id = ANY\(\$(\d+)::uuid\[\]\)\)/);
          const known = excluded ? bound(params, excluded[1]!) : [];
          return table(pointing[1]!).records
            .filter((record) => terms.some((term) => term.ids.includes(record[term.column] ?? '')))
            .filter((record) => !known.includes(record.id))
            .map((record) => ({ id: record.id }));
        }
        const counted = sql.match(/^SELECT COUNT\(\*\)::bigint AS row_count FROM "([a-z0-9_]+)" t WHERE t\."([a-z0-9_]+)" = ANY\(\$1::uuid\[\]\)$/);
        if (counted) {
          const ids = bound(params, '1');
          const rowCount = table(counted[1]!).records.filter((record) => ids.includes(record[counted[2]!] ?? '')).length;
          return [{ row_count: BigInt(rowCount) }];
        }
        if (sql.includes('AS index_present')) {
          const [tables, indexes] = params as [string[], string[]];
          return indexes.map((index, position) => ({
            index_name: index,
            table_present: state.has(tables[position]!),
            index_present: (options.indexes ?? []).includes(index),
          }));
        }
        if (sql.includes('FROM information_schema.columns')) {
          const [tables] = params as [string[]];
          return tables.flatMap((name) => (state.get(name)?.columns ?? [])
            .map((column) => ({ table_name: name, column_name: column })));
        }
        if (sql.includes('row_number() OVER')) {
          return rankedAnswers.shift() ?? [];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql, values: params } = render(strings, values);
        statements.push(sql);
        const whole = sql.match(/^DELETE FROM "([a-z0-9_]+)"$/);
        if (whole && params.length === 0) {
          const name = whole[1]!;
          const current = table(name);
          const requiredColumn = options.requiredColumns[name];
          if (requiredColumn && current.columns.includes(requiredColumn)) {
            throw new Error(`${name} already has ${requiredColumn}`);
          }
          const count = current.records.length;
          current.records = [];
          return count;
        }
        const byId = sql.match(/^DELETE FROM "([a-z0-9_]+)" WHERE id = ANY\(\$1::uuid\[\]\)$/);
        if (byId) {
          const current = table(byId[1]!);
          const ids = bound(params, '1');
          const before = current.records.length;
          current.records = current.records.filter((record) => !ids.includes(record.id));
          return before - current.records.length;
        }
        const neutralized = sql.match(/^UPDATE "([a-z0-9_]+)" SET "([a-z0-9_]+)" = \$1 WHERE id = ANY\(\$2::uuid\[\]\)$/);
        if (neutralized) {
          const ids = bound(params, '2');
          return update(neutralized[1]!, { [neutralized[2]!]: params[0] as string }, (record) => ids.includes(record.id), ids);
        }
        const unlinked = sql.match(/^UPDATE "([a-z0-9_]+)" SET (.+) WHERE "([a-z0-9_]+)" = ANY\(\$1::uuid\[\]\)$/);
        if (unlinked) {
          const set = Object.fromEntries([...unlinked[2]!.matchAll(/"([a-z0-9_]+)" = NULL/g)].map((column) => [column[1]!, null]));
          const ids = bound(params, '1');
          return update(unlinked[1]!, set, (record) => ids.includes(record[unlinked[3]!] ?? ''), ids);
        }
        throw new Error(`Unexpected statement: ${sql}`);
      }),
    },
  };

  function update(
    name: string,
    set: Record<string, RecordValue>,
    matches: (record: FakeRecord) => boolean,
    ids: string[],
  ): number {
    const current = table(name);
    updates.push({ table: name, set, ids });
    let count = 0;
    current.records = current.records.map((record) => {
      if (!matches(record)) return record;
      count += 1;
      return { ...record, ...set };
    });
    return count;
  }
}
