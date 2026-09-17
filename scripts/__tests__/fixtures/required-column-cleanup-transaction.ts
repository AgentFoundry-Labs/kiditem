import { Prisma } from '@prisma/client';
import { vi } from 'vitest';

/** One table as the database holds it: its row count and its columns. */
export type FakeTableState = { rows: number; columns: readonly string[] };

/** A row of the helper's kept-table reach query. */
export type FakeKeptTableReach = { listed_table: string; kept_table: string; action: string };

/**
 * A transaction for `removeRowsBlockingRequiredColumns`. SQL is rendered by
 * Prisma itself, so a listed identifier arrives inline and catalog inputs
 * arrive as bound values.
 *
 * - The kept-table reach query answers with `reaches`.
 * - The catalog answers for the table and column pairs it was asked about and,
 *   like a careless catalog, for every `unrequested` table too.
 * - Like PostgreSQL, a delete from a table the database does not have fails.
 *   Like the schema step, a delete from a table that already has the column it
 *   was listed for fails, so a passing run proves the helper never reached for
 *   either.
 */
export function requiredColumnCleanupTransaction(options: {
  tables: Record<string, FakeTableState>;
  requiredColumns: Readonly<Record<string, string>>;
  unrequested?: Record<string, FakeTableState>;
  reaches?: FakeKeptTableReach[];
}) {
  const unrequested = options.unrequested ?? {};
  const state = new Map(Object.entries({ ...options.tables, ...unrequested }));
  const statements: string[] = [];
  const reachLookups: unknown[][] = [];
  const catalogLookups: unknown[][] = [];
  const render = (strings: TemplateStringsArray, values: unknown[]) => {
    const query = Prisma.sql(strings, ...values);
    return { sql: query.sql.replace(/\s+/g, ' ').trim(), values: query.values };
  };

  return {
    statements,
    reachLookups,
    catalogLookups,
    deletes: () => statements.filter((sql) => sql.startsWith('DELETE')),
    rowsOf: (table: string) => state.get(table)?.rows,
    tx: {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql, values: bound } = render(strings, values);
        statements.push(sql);
        if (sql.startsWith('WITH RECURSIVE deleted')) {
          reachLookups.push(bound);
          return options.reaches ?? [];
        }
        if (!sql.includes('FROM unnest(')) throw new Error(`Unexpected query: ${sql}`);
        catalogLookups.push(bound);
        const [requestedTables, requestedColumns] = bound as [string[], string[]];
        const rows = requestedTables.map((table, index) => ({
          table_name: table,
          table_present: state.has(table),
          required_column_present: state.get(table)?.columns.includes(requestedColumns[index]!) ?? false,
        }));
        for (const table of Object.keys(unrequested)) {
          rows.push({ table_name: table, table_present: true, required_column_present: false });
        }
        return rows;
      }),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { sql, values: bound } = render(strings, values);
        statements.push(sql);
        const table = sql.match(/^DELETE FROM "([a-z0-9_]+)"$/)?.[1];
        if (!table || bound.length > 0) throw new Error(`Unexpected statement: ${sql}`);
        const current = state.get(table);
        if (!current) throw new Error(`relation "${table}" does not exist`);
        const requiredColumn = options.requiredColumns[table];
        if (requiredColumn && current.columns.includes(requiredColumn)) {
          throw new Error(`${table} already has ${requiredColumn}`);
        }
        state.set(table, { ...current, rows: 0 });
        return current.rows;
      }),
    },
  };
}
