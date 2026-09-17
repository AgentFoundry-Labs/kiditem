import type { Prisma } from '@prisma/client';
import type { DataMigrationContext } from '../types';

export type EnsureStepResult = {
  /** Rows or database objects the step changed; 0 when the state was already in place. */
  changedRows: number;
  details: Record<string, unknown>;
};

/**
 * State every database needs whatever its migration history. A step is live
 * code maintained with the schema: unlike a `DataMigration` it is not frozen
 * once it runs, writes no `data_migration_runs` row, and runs again after
 * every post-schema `data:migrate -- up`. It must therefore be idempotent,
 * report zero changes when its state is already in place, and leave nothing
 * behind when it fails, so the same command can simply be run again.
 */
export type EnsureStep = {
  id: `ensure:${string}`;
  name: string;
  run(
    tx: Prisma.TransactionClient,
    context: DataMigrationContext,
  ): Promise<EnsureStepResult>;
};
