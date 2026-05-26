import type { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

export const removeLegacySourcingWorkspaceSnapshotPayloads: DataMigration = {
  id: 'v0.1.3:001_remove_legacy_sourcing_workspace_snapshot_payloads',
  releaseVersion: '0.1.3',
  name: 'Remove legacy sourcing workspace snapshot payloads',
  async run(tx) {
    const hasSnapshots = await hasTable(tx, 'sourcing_workspace_snapshots');
    if (!hasSnapshots) {
      return {
        affectedRows: 0,
        details: {
          skipped: 'sourcing workspace snapshot schema is not available',
        },
      };
    }

    const affectedRows = await tx.$executeRaw`
      DELETE FROM sourcing_workspace_snapshots
      WHERE NOT (
        payload->>'version' = '1'
        AND jsonb_typeof(payload->'input') = 'object'
        AND jsonb_typeof(payload->'result') = 'object'
        AND jsonb_typeof(payload->'meta') = 'object'
        AND jsonb_typeof(payload->'meta'->'generatedAt') = 'string'
        AND jsonb_typeof(payload->'meta'->'generatorVersion') = 'string'
        AND payload->'meta'->>'generationSource' IN ('manual', 'scheduled', 'imported')
        AND (
          (
            scope = 'today_recommendations'
            AND jsonb_typeof(payload->'input'->'keywordText') = 'string'
            AND jsonb_typeof(payload->'input'->'keywordLimit') = 'number'
            AND jsonb_typeof(payload->'input'->'maxPages') = 'number'
            AND jsonb_typeof(payload->'result'->'rows') = 'array'
            AND jsonb_typeof(payload->'result'->'productSnapshots') = 'array'
          )
          OR (
            scope = 'keyword_analysis'
            AND jsonb_typeof(payload->'input'->'filters') = 'object'
            AND jsonb_typeof(payload->'input'->'keywordQuery') = 'string'
            AND jsonb_typeof(payload->'input'->'trendText') = 'string'
            AND jsonb_typeof(payload->'result'->'boards') = 'array'
            AND jsonb_typeof(payload->'result'->'trendItems') = 'array'
            AND jsonb_typeof(payload->'result'->'searchAdRelatedItems') = 'array'
            AND jsonb_typeof(payload->'result'->'relatedSearchItems') = 'array'
            AND jsonb_typeof(payload->'result'->'autocompleteItems') = 'array'
            AND jsonb_typeof(payload->'result'->'coupangKeywordItems') = 'array'
            AND jsonb_typeof(payload->'result'->'coupangProductNameTokens') = 'array'
          )
        )
      )
    `;

    return {
      affectedRows,
      details: {
        removedLegacySnapshots: affectedRows,
      },
    };
  },
};

async function hasTable(tx: Prisma.TransactionClient, tableName: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}
