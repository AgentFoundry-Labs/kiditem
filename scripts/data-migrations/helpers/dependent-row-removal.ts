import { Prisma } from '@prisma/client';

/**
 * The rows every schema/data cutover carries forward under
 * [ADR-0010](../../../docs/adr/0010-schema-cleanup-may-discard-office-data.md)
 * and the data-loss policy in `docs/runbooks/deployment-architecture.md`,
 * keyed by the ADR's words. A cleanup never deletes from these tables. A
 * dependent step may only unlink a nullable reference from one, or record that
 * one blocks the removal.
 */
export const ADR_0010_KEPT_TABLES = {
  'users and organizations': ['users', 'organizations', 'organization_memberships'],
  'channel accounts': ['channel_accounts'],
  'confirmed recipes': ['channel_listing_option_inventory_components'],
  orders: ['orders', 'order_line_items'],
  // The Coupang direct receipts and consumptions (ADR-0008), and the Sellpia
  // transmission fence a receipt returns on replay: losing any of them could
  // apply or transmit the same effect twice.
  'transport receipts': [
    'coupang_direct_transport_receipts',
    'coupang_direct_transport_consumptions',
    'sellpia_order_transmission_intents',
    'sellpia_order_transmission_intent_reconciliations',
  ],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export const KEPT_TABLES: readonly string[] = Object.values(ADR_0010_KEPT_TABLES).flat();

/** Who approved an entry that deletes human-entered rows, when, and what they reviewed. */
export type OwnerApprovalRecord = {
  readonly by: string;
  /** `YYYY-MM-DD`. */
  readonly at: string;
  readonly scope: string;
};

/**
 * The owner's answer for an entry that deletes rows people entered.
 * `pending` stops the migration before its first statement; the record is the
 * approval.
 */
export type OwnerApproval = 'pending' | OwnerApprovalRecord;

/**
 * What a deleted dependent row holds, so the impact an owner approves is
 * explicit.
 *
 * - `collected`: facts a source collects again.
 * - `derived`: results the application computes again.
 * - `human-entered`: decisions, approvals, confirmations, or registrations a
 *   person made. After a delete, only the cutover dump holds them.
 */
export type DependentRowKind = 'collected' | 'derived' | 'human-entered';

type DependentRowLink = {
  readonly table: string;
  /** The foreign key column. The key may pair it with `organization_id`; it points at `id`. */
  readonly column: string;
  /** The root table, or a table a later step deletes from. */
  readonly references: string;
};

/**
 * One foreign key into a table a cleanup deletes from.
 *
 * - `delete`: rows pointing at a removed row are removed first. A step that
 *   references its own table follows the chain to its end.
 * - `unlink`: the pointer (and `alsoClear`) becomes NULL, and the row stays.
 *   The only way a step may touch an ADR-0010 kept table.
 * - `keep`: a row pointing at a removed row blocks the removal. For a
 *   non-nullable reference from a kept table.
 */
export type DependentRowStep =
  | (DependentRowLink & { readonly action: 'delete'; readonly kind: DependentRowKind })
  | (DependentRowLink & { readonly action: 'unlink'; readonly alsoClear?: readonly string[] })
  | (DependentRowLink & { readonly action: 'keep' });

type UnlinkStep = Extract<DependentRowStep, { action: 'unlink' }>;
type KeepStep = Extract<DependentRowStep, { action: 'keep' }>;

/** An entry of any cleanup list, as the approval gate reads it. */
export type ApprovalEntry = {
  readonly label: string;
  readonly dependents?: readonly DependentRowStep[];
  readonly ownerApproval?: OwnerApproval;
};

/** A foreign key as the live catalog has it. */
export type ForeignKey = {
  readonly name: string;
  readonly childTable: string;
  readonly parentTable: string;
  /** Child and parent columns, pair by pair. */
  readonly pairs: ReadonlyArray<{ readonly child: string; readonly parent: string }>;
};

/**
 * The rows a removal reaches. Deletes are in delete order; the root rows are
 * not included.
 */
export type DependentRowPlan = {
  readonly deletes: ReadonlyArray<{ readonly table: string; readonly ids: readonly string[] }>;
  readonly unlinks: ReadonlyArray<{ readonly step: UnlinkStep; readonly parentIds: readonly string[] }>;
  /** Rows of a kept table that point at a removed row, by `table.column`. */
  readonly keptReferences: Readonly<Record<string, number>>;
  /** Whether a `keep` step found a row, so the removal cannot happen. */
  readonly blocked: boolean;
};

export type DependentRowCounts = {
  dependentRows: Record<string, number>;
  unlinkedRows: Record<string, number>;
};

export type SqlClient = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

/** Lowercase identifiers only, so a listed name is safe to inline and quote. */
const PLAIN_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEPENDENT_ROW_KINDS: readonly DependentRowKind[] = ['collected', 'derived', 'human-entered'];

type ForeignKeyRow = {
  child_table: string;
  parent_table: string;
  constraint_name: string;
  child_columns: string[];
  parent_columns: string[];
};
type IdRow = { id: string };
type CountRow = { row_count: bigint | number | string };

export function isPlainIdentifier(name: string): boolean {
  return PLAIN_IDENTIFIER.test(name);
}

/** Quotes a name that passes the identifier check, and refuses anything else. */
export function quotedIdentifier(name: string): Prisma.Sql {
  if (!isPlainIdentifier(name)) {
    throw new Error(`Unexpected identifier: ${JSON.stringify(name)}`);
  }
  return Prisma.raw(`"${name}"`);
}

/** The root, then every table a delete step removes rows from, in delete order. */
export function tablesDeletedBy(root: string, steps: readonly DependentRowStep[] = []): string[] {
  return unique([root, ...steps.filter((step) => step.action === 'delete').map((step) => step.table)]);
}

/** The tables whose rows an entry deletes although a person entered them. */
export function humanEnteredTables(steps: readonly DependentRowStep[] = []): string[] {
  return unique(steps
    .filter((step) => step.action === 'delete' && step.kind === 'human-entered')
    .map((step) => step.table));
}

/**
 * Throws for a step list a cleanup must not run. `label` names the entry in
 * the message; nothing has touched the database yet.
 */
export function assertDependentRowSteps(
  label: string,
  root: string,
  steps: readonly DependentRowStep[] = [],
): void {
  if (KEPT_TABLES.includes(root)) {
    throw new Error(`${label} refuses ${root}: ADR-0010 carries its rows through every cutover.`);
  }
  const firstDelete = new Map<string, number>();
  steps.forEach((step, position) => {
    if (step.action === 'delete' && !firstDelete.has(step.table)) firstDelete.set(step.table, position);
  });
  const deletedLater = (table: string, position: number) =>
    table === root || (firstDelete.get(table) ?? -1) > position;
  const seen = new Set<string>();
  steps.forEach((step, position) => {
    const link = `${step.table}.${step.column} -> ${step.references}`;
    const names = [
      step.table,
      step.column,
      step.references,
      ...(step.action === 'unlink' ? step.alsoClear ?? [] : []),
    ];
    if (!names.every(isPlainIdentifier)) {
      throw new Error(`${label} needs plain lowercase identifiers, got ${JSON.stringify(link)}.`);
    }
    if (!['delete', 'unlink', 'keep'].includes(step.action)) {
      throw new Error(`${label} gives ${link} an unknown action ${JSON.stringify(step.action)}.`);
    }
    if (step.table === root) {
      throw new Error(`${label} lists its own table as a dependent.`);
    }
    if (seen.has(link)) {
      throw new Error(`${label} lists ${link} more than once.`);
    }
    seen.add(link);
    if (step.action === 'delete') {
      if (!DEPENDENT_ROW_KINDS.includes(step.kind)) {
        throw new Error(`${label} gives ${link} an unknown kind ${JSON.stringify(step.kind)}.`);
      }
      if (KEPT_TABLES.includes(step.table)) {
        throw new Error(`${label} refuses ${step.table}: ADR-0010 carries its rows through every cutover.`);
      }
      const ordered = step.references === step.table
        || deletedLater(step.references, firstDelete.get(step.table)!);
      if (!ordered) {
        throw new Error(`${label} must delete ${step.table} before ${step.references}, which a later step deletes: ${link}.`);
      }
      return;
    }
    if (step.action === 'keep' && !KEPT_TABLES.includes(step.table)) {
      throw new Error(`${label} can only keep a removed row for an ADR-0010 kept table: ${link}.`);
    }
    // An unlink or keep step reads rows of a table a later step deletes from.
    if (!deletedLater(step.references, position)) {
      throw new Error(`${label} must ${step.action} ${link} before a later step deletes ${step.references}.`);
    }
  });
}

/**
 * Throws for an approval an entry must not carry: one it does not need, one
 * it needs and lacks, or one that does not name who, when, and what.
 */
export function assertOwnerApprovalDeclared(entry: ApprovalEntry): void {
  const needed = humanEnteredTables(entry.dependents).length > 0;
  const approval = entry.ownerApproval;
  if (approval === undefined) {
    if (needed) {
      throw new Error(
        `${entry.label} deletes human-entered rows in ${humanEnteredTables(entry.dependents).join(', ')} `
          + 'and needs ownerApproval.',
      );
    }
    return;
  }
  if (!needed) {
    throw new Error(`${entry.label} declares ownerApproval but deletes no human-entered rows.`);
  }
  if (approval === 'pending') return;
  const valid = typeof approval === 'object'
    && typeof approval.by === 'string' && approval.by.trim() !== ''
    && typeof approval.at === 'string' && ISO_DATE.test(approval.at)
    && typeof approval.scope === 'string' && approval.scope.trim() !== '';
  if (!valid) {
    throw new Error(`${entry.label} needs ownerApproval 'pending' or { by, at: 'YYYY-MM-DD', scope }.`);
  }
}

/**
 * Stops a run while any entry waits for the owner. A migration calls it before
 * its first statement.
 */
export function assertOwnerApprovals(entries: readonly ApprovalEntry[]): void {
  const pending = entries.filter((entry) => entry.ownerApproval === 'pending');
  if (pending.length === 0) return;
  const described = pending
    .map((entry) => `${entry.label} (deletes human-entered rows in ${humanEnteredTables(entry.dependents).join(', ')})`)
    .join('; ');
  throw new Error(
    `Row cleanup waits for the owner's approval of ${described}. Nothing was deleted. `
      + 'Record the approval as ownerApproval { by, at, scope } once the owner approves this impact.',
  );
}

/**
 * Every foreign key the live catalog has into `tables`, with each identifier
 * checked. Only references to `id`, optionally paired with `organization_id`,
 * are supported; anything else is refused.
 */
export async function foreignKeysInto(tx: SqlClient, tables: readonly string[]): Promise<ForeignKey[]> {
  const rows = await tx.$queryRaw<ForeignKeyRow[]>`
    SELECT
      child.relname::text AS child_table,
      parent.relname::text AS parent_table,
      fk.conname::text AS constraint_name,
      ARRAY(
        SELECT a.attname::text
        FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, position)
        JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k.attnum
        ORDER BY k.position
      ) AS child_columns,
      ARRAY(
        SELECT a.attname::text
        FROM unnest(fk.confkey) WITH ORDINALITY AS k(attnum, position)
        JOIN pg_attribute a ON a.attrelid = fk.confrelid AND a.attnum = k.attnum
        ORDER BY k.position
      ) AS parent_columns
    FROM pg_constraint fk
    JOIN pg_class parent ON parent.oid = fk.confrelid
    JOIN pg_class child ON child.oid = fk.conrelid
    WHERE fk.contype = 'f'
      AND parent.relnamespace = to_regnamespace(current_schema())
      AND parent.relname::text = ANY(${[...tables]}::text[])
    ORDER BY 2, 1, 3
  `;
  return rows.map((row) => {
    const pairs = row.child_columns.map((child, index) => ({ child, parent: row.parent_columns[index] ?? '' }));
    const names = [row.child_table, row.parent_table, ...pairs.flatMap((pair) => [pair.child, pair.parent])];
    const parents = pairs.map((pair) => pair.parent).sort().join(',');
    const supported = names.every(isPlainIdentifier)
      && pairs.length === row.parent_columns.length
      && (parents === 'id' || parents === 'id,organization_id')
      && pairs.every((pair) => pair.parent !== 'organization_id' || pair.child === 'organization_id');
    if (!supported) {
      throw new Error(
        `Row cleanup cannot follow foreign key ${JSON.stringify(row.constraint_name)} `
          + `from ${JSON.stringify(row.child_table)} to ${JSON.stringify(row.parent_table)}.`,
      );
    }
    return { name: row.constraint_name, childTable: row.child_table, parentTable: row.parent_table, pairs };
  });
}

/** The column of `foreignKey` that points at `id`. */
export function referencingColumn(foreignKey: ForeignKey): string {
  return foreignKey.pairs.find((pair) => pair.parent === 'id')!.child;
}

/**
 * The declared steps the database backs with a foreign key, in declared
 * order. A foreign key into a table the entry deletes from that no step
 * declares is refused, so a schema change cannot add a silent cascade or a
 * restricting reference behind the list's back.
 */
export function activeDependentRowSteps(
  label: string,
  root: string,
  steps: readonly DependentRowStep[] = [],
  foreignKeys: readonly ForeignKey[],
): DependentRowStep[] {
  const deleted = tablesDeletedBy(root, steps);
  const active = new Set<DependentRowStep>();
  const undeclared: string[] = [];
  for (const foreignKey of foreignKeys) {
    if (!deleted.includes(foreignKey.parentTable)) continue;
    const column = referencingColumn(foreignKey);
    const step = steps.find((candidate) =>
      candidate.table === foreignKey.childTable
      && candidate.column === column
      && candidate.references === foreignKey.parentTable);
    if (step) active.add(step);
    else undeclared.push(`${foreignKey.childTable}.${column} -> ${foreignKey.parentTable}`);
  }
  if (undeclared.length > 0) {
    throw new Error(`${label} refuses foreign keys its dependents do not declare: ${undeclared.join(', ')}.`);
  }
  return steps.filter((step) => active.has(step));
}

/**
 * Finds every row the removal of `rootIds` from `root` reaches through the
 * active steps. Reads only.
 */
export async function planDependentRowRemoval(
  tx: SqlClient,
  root: string,
  rootIds: readonly string[],
  steps: readonly DependentRowStep[],
): Promise<DependentRowPlan> {
  const doomed = new Map<string, string[]>([[root, [...rootIds]]]);
  const deleteOrder = tablesDeletedBy(root, steps).slice(1);
  for (const table of [...deleteOrder].reverse()) {
    const own = steps.filter((step) => step.action === 'delete' && step.table === table);
    const ids = new Set<string>();
    const pointing = own
      .filter((step) => step.references !== table)
      .map((step) => ({ step, parentIds: doomed.get(step.references) ?? [] }))
      .filter(({ parentIds }) => parentIds.length > 0);
    if (pointing.length > 0) {
      const rows = await tx.$queryRaw<IdRow[]>`
        SELECT t.id::text AS id
        FROM ${quotedIdentifier(table)} t
        WHERE ${Prisma.join(pointing.map(({ step, parentIds }) =>
          Prisma.sql`t.${quotedIdentifier(step.column)} = ANY(${parentIds}::uuid[])`), ' OR ')}
      `;
      for (const row of rows) ids.add(row.id);
    }
    for (const step of own.filter((candidate) => candidate.references === table)) {
      let frontier = [...ids];
      while (frontier.length > 0) {
        const rows = await tx.$queryRaw<IdRow[]>`
          SELECT t.id::text AS id
          FROM ${quotedIdentifier(table)} t
          WHERE t.${quotedIdentifier(step.column)} = ANY(${frontier}::uuid[])
            AND NOT (t.id = ANY(${[...ids]}::uuid[]))
        `;
        frontier = rows.map((row) => row.id);
        for (const id of frontier) ids.add(id);
      }
    }
    doomed.set(table, [...ids].sort());
  }

  const unlinks: Array<{ step: UnlinkStep; parentIds: string[] }> = [];
  const keptReferences: Record<string, number> = {};
  let blocked = false;
  for (const step of steps) {
    if (step.action === 'delete') continue;
    const parentIds = doomed.get(step.references) ?? [];
    if (step.action === 'unlink') unlinks.push({ step, parentIds });
    const counted = step.action === 'keep' || KEPT_TABLES.includes(step.table);
    if (!counted || parentIds.length === 0) continue;
    const [row] = await tx.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS row_count
      FROM ${quotedIdentifier(step.table)} t
      WHERE t.${quotedIdentifier(step.column)} = ANY(${parentIds}::uuid[])
    `;
    const rows = Number(row?.row_count ?? 0);
    if (rows === 0) continue;
    if (KEPT_TABLES.includes(step.table)) keptReferences[`${step.table}.${step.column}`] = rows;
    if (step.action === 'keep') blocked = true;
  }

  return {
    deletes: deleteOrder.map((table) => ({ table, ids: doomed.get(table) ?? [] })),
    unlinks,
    keptReferences,
    blocked,
  };
}

/**
 * Carries out a plan in declared step order: each unlink before the rows it
 * points at go, and each table's delete before the tables it references.
 * Kept tables are only ever updated. The root rows are the caller's.
 */
export async function applyDependentRowRemoval(
  tx: SqlClient,
  plan: DependentRowPlan,
  steps: readonly DependentRowStep[],
): Promise<DependentRowCounts> {
  if (plan.blocked) {
    throw new Error('Row cleanup cannot apply a plan that a kept row blocks.');
  }
  const counts: DependentRowCounts = { dependentRows: {}, unlinkedRows: {} };
  const deleted = new Set<string>();
  for (const step of steps) {
    if (step.action === 'keep') continue;
    if (step.action === 'unlink') {
      const parentIds = plan.unlinks.find((unlink) => unlink.step === step)?.parentIds ?? [];
      if (parentIds.length === 0) continue;
      const cleared = unique([step.column, ...(step.alsoClear ?? [])]);
      const updated = await tx.$executeRaw`
        UPDATE ${quotedIdentifier(step.table)}
        SET ${Prisma.join(cleared.map((column) => Prisma.sql`${quotedIdentifier(column)} = NULL`), ', ')}
        WHERE ${quotedIdentifier(step.column)} = ANY(${[...parentIds]}::uuid[])
      `;
      if (updated > 0) {
        const key = `${step.table}.${step.column}`;
        counts.unlinkedRows[key] = (counts.unlinkedRows[key] ?? 0) + updated;
      }
      continue;
    }
    if (deleted.has(step.table) || KEPT_TABLES.includes(step.table)) continue;
    deleted.add(step.table);
    const ids = plan.deletes.find((entry) => entry.table === step.table)?.ids ?? [];
    if (ids.length === 0) continue;
    const removed = await tx.$executeRaw`
      DELETE FROM ${quotedIdentifier(step.table)}
      WHERE id = ANY(${[...ids]}::uuid[])
    `;
    if (removed > 0) counts.dependentRows[step.table] = removed;
  }
  return counts;
}

/** Adds `counts` into `into`, key by key. */
export function addCounts(into: Record<string, number>, counts: Readonly<Record<string, number>>): void {
  for (const [key, value] of Object.entries(counts)) into[key] = (into[key] ?? 0) + value;
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
