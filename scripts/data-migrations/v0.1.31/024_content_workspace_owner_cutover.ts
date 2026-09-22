import { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

/**
 * KID-310: the content workspace moves from the sourcing candidate to the
 * sales-product draft that 023 created for it.
 *
 * Pre-schema, like 022: it adds `content_workspaces.sales_product_id` itself,
 * moves every candidate-owned workspace onto its draft, and proves that the
 * candidate columns about to be dropped say nothing the workspace does not
 * already say. Anything unproven aborts the whole transaction — no workspace
 * is left without an owner and no provenance is silently discarded.
 */
export const contentWorkspaceOwnerCutoverMigration: DataMigration = {
  id: 'v0.1.31:024_content_workspace_owner_cutover',
  releaseVersion: '0.1.31',
  name: 'Move content workspaces from the sourcing candidate to its sales-product draft',
  phase: 'pre-schema',
  async run(tx) {
    const shape = await readShape(tx);
    if (!shape.workspaces) {
      return { affectedRows: 0, details: { outcome: 'absent' } };
    }
    if (!shape.candidateColumn) {
      return { affectedRows: 0, details: { outcome: 'already_contracted' } };
    }

    await expandSalesProductColumn(tx, shape.salesProductColumn);
    await assertEveryCandidateWorkspaceHasDraft(tx);
    await assertLedgerCandidatesMatchTheirWorkspace(tx);

    const movedWorkspaces = await moveWorkspacesToDrafts(tx);
    await assertOneActiveWorkspacePerDraft(tx);

    return { affectedRows: movedWorkspaces, details: { movedWorkspaces, outcome: 'moved' } };
  },
};

type Shape = {
  workspaces: boolean;
  candidateColumn: boolean;
  salesProductColumn: boolean;
};

async function readShape(tx: Prisma.TransactionClient): Promise<Shape> {
  const [row] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('content_workspaces') IS NOT NULL AS present
  `;
  if (!row?.present) {
    return { workspaces: false, candidateColumn: false, salesProductColumn: false };
  }
  return {
    workspaces: true,
    candidateColumn: await columnExists(tx, 'content_workspaces', 'source_candidate_id'),
    salesProductColumn: await columnExists(tx, 'content_workspaces', 'sales_product_id'),
  };
}

async function columnExists(
  tx: Prisma.TransactionClient,
  table: string,
  column: string,
): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass(${table})
        AND attname = ${column}
        AND attnum > 0
        AND NOT attisdropped
    ) AS present
  `;
  return Boolean(row?.present);
}

async function expandSalesProductColumn(
  tx: Prisma.TransactionClient,
  alreadyPresent: boolean,
): Promise<void> {
  if (alreadyPresent) return;
  await tx.$executeRaw`ALTER TABLE content_workspaces ADD COLUMN sales_product_id uuid`;
}

/**
 * 023 creates one draft per live candidate. A *live* candidate workspace with no
 * draft means 023 has not run (or did not cover this row), and moving it would
 * silently orphan the operator's content.
 *
 * An archived workspace is deliberately not held to this: candidate deletion
 * archives the workspace and leaves no draft behind, so requiring one would
 * stop the whole cutover over content nobody can reach. Those rows keep their
 * archived state and lose only the candidate column (ADR-0010).
 */
async function assertEveryCandidateWorkspaceHasDraft(tx: Prisma.TransactionClient): Promise<void> {
  const orphans = await tx.$queryRaw<Array<{ id: string }>>`
    -- queryraw-tenancy-exempt: the writer-stopped cutover validates every organization at once.
    SELECT w.id::text AS id
    FROM content_workspaces w
    WHERE w.owner_type = 'sourcing_candidate'
      AND w.source_candidate_id IS NOT NULL
      AND w.status = 'active'
      AND w.is_deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM sales_products p
        WHERE p.organization_id = w.organization_id
          AND p.source_candidate_id = w.source_candidate_id
      )
    ORDER BY w.id
    LIMIT 20
  `;
  if (orphans.length === 0) return;
  throw new Error(
    `${orphans.length} content workspace(s) have no sales-product draft; run v0.1.31:023 first. `
    + `First: ${orphans.map((row) => row.id).join(', ')}`,
  );
}

/**
 * The candidate columns on the generation ledgers are dropped right after this
 * migration because the workspace already carries the same provenance. That is
 * only true if they agree today, so prove it before the columns are gone.
 */
async function assertLedgerCandidatesMatchTheirWorkspace(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await assertNoMismatch(tx, 'thumbnail_generations', Prisma.sql`
    SELECT g.id::text AS id
    FROM thumbnail_generations g
    JOIN content_workspaces w ON w.id = g.content_workspace_id
    WHERE g.source_candidate_id IS NOT NULL
      AND g.source_candidate_id IS DISTINCT FROM w.source_candidate_id
    ORDER BY g.id
    LIMIT 20
  `);
  await assertNoMismatch(tx, 'content_generations', Prisma.sql`
    SELECT g.id::text AS id
    FROM content_generations g
    JOIN content_workspaces w ON w.id = g.content_workspace_id
    WHERE g.source_candidate_id IS NOT NULL
      AND g.source_candidate_id IS DISTINCT FROM w.source_candidate_id
    ORDER BY g.id
    LIMIT 20
  `);
  await assertNoMismatch(tx, 'detail_page_image_render_intents', Prisma.sql`
    SELECT i.id::text AS id
    FROM detail_page_image_render_intents i
    JOIN detail_page_artifacts a ON a.id = i.detail_page_artifact_id
    JOIN content_workspaces w ON w.id = a.content_workspace_id
    WHERE i.source_candidate_id IS DISTINCT FROM w.source_candidate_id
    ORDER BY i.id
    LIMIT 20
  `);
}

async function assertNoMismatch(
  tx: Prisma.TransactionClient,
  table: string,
  query: Prisma.Sql,
): Promise<void> {
  // queryraw-tenancy-exempt: the writer-stopped cutover validates every organization at once.
  const mismatched = await tx.$queryRaw<Array<{ id: string }>>(query);
  if (mismatched.length === 0) return;
  throw new Error(
    `${mismatched.length} ${table} row(s) name a sourcing candidate their content workspace does not. `
    + `First: ${mismatched.map((row) => row.id).join(', ')}`,
  );
}

async function moveWorkspacesToDrafts(tx: Prisma.TransactionClient): Promise<number> {
  return tx.$executeRaw`
    -- queryraw-tenancy-exempt: the writer-stopped cutover moves every organization at once.
    UPDATE content_workspaces w
    SET sales_product_id = p.id,
        owner_type = 'sales_product'
    FROM sales_products p
    WHERE p.organization_id = w.organization_id
      AND p.source_candidate_id = w.source_candidate_id
      AND w.owner_type = 'sourcing_candidate'
      AND w.source_candidate_id IS NOT NULL
      AND w.status = 'active'
      AND w.is_deleted = false
  `;
}

/**
 * The schema push adds a partial unique key on the active workspace per draft.
 * Two candidate workspaces that landed on the same draft would stop it, so the
 * conflict surfaces here instead of half-way through `db push`.
 */
async function assertOneActiveWorkspacePerDraft(tx: Prisma.TransactionClient): Promise<void> {
  const duplicates = await tx.$queryRaw<Array<{ sales_product_id: string; count: bigint }>>`
    -- queryraw-tenancy-exempt: the writer-stopped cutover validates every organization at once.
    SELECT sales_product_id::text AS sales_product_id, count(*)::bigint AS count
    FROM content_workspaces
    WHERE sales_product_id IS NOT NULL
      AND status = 'active'
      AND is_deleted = false
    GROUP BY organization_id, sales_product_id
    HAVING count(*) > 1
    ORDER BY sales_product_id
    LIMIT 20
  `;
  if (duplicates.length === 0) return;
  throw new Error(
    'content_workspaces_sales_product_active_key would reject '
    + `${duplicates.length} draft(s) with more than one active workspace. `
    + `First: ${duplicates.map((row) => row.sales_product_id).join(', ')}`,
  );
}
