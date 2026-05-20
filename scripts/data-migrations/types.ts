import type { Prisma } from '@prisma/client';

export type MigrationResult = {
  affectedRows: number;
  details: Record<string, unknown>;
};

export type DataMigration = {
  id: string;
  releaseVersion: string;
  name: string;
  phase?: 'pre-schema' | 'post-schema';
  run(tx: Prisma.TransactionClient): Promise<MigrationResult>;
};
