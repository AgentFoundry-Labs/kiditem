import { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_STATUSES } from '@kiditem/shared/source-import';

/**
 * PostgreSQL holds `source_import_runs.status` to `SOURCE_IMPORT_RUN_STATUSES`
 * with this CHECK constraint, which a Prisma `String` field cannot declare.
 * `db push` leaves a CHECK constraint it does not know in place. Data
 * migration v0.1.31:012 creates it during the 0.1.31 cutover, the
 * `ensure:source_import_run_status_check` step re-applies it after every
 * post-schema `data:migrate -- up`, and the integration test setup creates it
 * after every push. All three call this module.
 */
export const SOURCE_IMPORT_RUN_STATUS_CHECK = 'source_import_runs_status_check';

export type SourceImportRunStatusCheckOutcome = 'created' | 'recreated' | 'unchanged';

type SqlClient = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

type ConstraintRow = { expression: string | null; validated: boolean };

const PLAIN_WORD = /^[a-z_]+$/;

/** The CHECK expression as PostgreSQL 17 prints it back with `pg_get_expr`. */
export function sourceImportRunStatusCheckExpression(): string {
  const values = allowedStatuses().map((status) => `'${status}'::text`).join(', ');
  return `(status = ANY (ARRAY[${values}]))`;
}

/**
 * Creates the constraint, or re-creates it when a constraint of that name has
 * another expression or was never validated. Every row must already hold an
 * allowed status, or PostgreSQL refuses the constraint.
 */
export async function ensureSourceImportRunStatusCheck(
  db: SqlClient,
): Promise<SourceImportRunStatusCheckOutcome> {
  const [existing] = await db.$queryRaw<ConstraintRow[]>`
    SELECT pg_get_expr(conbin, conrelid) AS expression, convalidated AS validated
    FROM pg_constraint
    WHERE conrelid = 'public.source_import_runs'::regclass
      AND conname = ${SOURCE_IMPORT_RUN_STATUS_CHECK}
  `;
  if (existing?.validated && existing.expression === sourceImportRunStatusCheckExpression()) {
    return 'unchanged';
  }

  const constraint = Prisma.raw(SOURCE_IMPORT_RUN_STATUS_CHECK);
  if (existing) {
    await db.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT ${constraint}`;
  }
  // DDL takes no bind parameters, so the statuses are written as literals;
  // allowedStatuses() admits plain lowercase words only.
  const values = Prisma.raw(allowedStatuses().map((status) => `'${status}'`).join(', '));
  await db.$executeRaw`
    ALTER TABLE source_import_runs
    ADD CONSTRAINT ${constraint} CHECK (status IN (${values}))
  `;
  return existing ? 'recreated' : 'created';
}

function allowedStatuses(): readonly string[] {
  for (const status of SOURCE_IMPORT_RUN_STATUSES) {
    if (!PLAIN_WORD.test(status)) {
      throw new Error(`SourceImportRun status "${status}" is not a plain lowercase word.`);
    }
  }
  return SOURCE_IMPORT_RUN_STATUSES;
}
