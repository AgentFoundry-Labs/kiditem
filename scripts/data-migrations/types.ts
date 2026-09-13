import type { Prisma } from '@prisma/client';

export type MigrationResult = {
  affectedRows: number;
  details: Record<string, unknown>;
};

export type DataMigrationTarget = 'local' | 'office';

export type DataMigrationContext = {
  target: DataMigrationTarget;
};

export type DataMigration = {
  id: string;
  releaseVersion: string;
  name: string;
  phase?: 'pre-schema' | 'post-schema';
  run(
    tx: Prisma.TransactionClient,
    context?: DataMigrationContext,
  ): Promise<MigrationResult>;
};

export type RetiredDataMigration = {
  id: string;
  releaseVersion: string;
  name: string;
  sourcePath: string;
  sourceSha256: string;
  baselineCommit: string;
  replacementMigrations: ReadonlyArray<{
    id: string;
    path: string;
  }>;
};
