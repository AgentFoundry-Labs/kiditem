import type { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

const RETIRED_MESSAGE =
  'Fixed AI generation moved out of Agent OS; legacy queued request was closed by data migration.';

export const retireFixedAiAgentOsRequests: DataMigration = {
  id: 'v0.1.2:003_retire_fixed_ai_agent_os_requests',
  releaseVersion: '0.1.2',
  name: 'Retire fixed AI Agent OS requests for direct AI jobs',
  async run(tx) {
    const hasAgentTables =
      await hasTable(tx, 'agent_instances') &&
      await hasTable(tx, 'agent_run_requests') &&
      await hasTable(tx, 'agent_runs');
    if (!hasAgentTables) {
      return {
        affectedRows: 0,
        details: {
          skipped: 'Agent OS tables are not available',
        },
      };
    }

    const hasContentGenerations = await hasTable(tx, 'content_generations');
    const hasThumbnailGenerations = await hasTable(tx, 'thumbnail_generations');
    const hasAlerts = await hasTable(tx, 'alerts');

    const cancelledRuns = await tx.$executeRaw`
      WITH fixed_requests AS (
        SELECT arr.id
        FROM agent_run_requests arr
        JOIN agent_instances ai
          ON ai.id = arr.agent_instance_id
         AND ai.organization_id = arr.organization_id
        WHERE ai.type IN ('detail_page_generate', 'thumbnail_generate', 'image_edit')
      )
      UPDATE agent_runs run
      SET status = 'cancelled',
          finished_at = COALESCE(run.finished_at, now()),
          error_code = COALESCE(run.error_code, 'fixed_ai_agent_os_retired'),
          error_message = COALESCE(run.error_message, ${RETIRED_MESSAGE}),
          updated_at = now()
      FROM fixed_requests
      WHERE run.request_id = fixed_requests.id
        AND run.status = 'running'
    `;

    const cancelledRequests = await tx.$executeRaw`
      WITH fixed_requests AS (
        SELECT arr.id
        FROM agent_run_requests arr
        JOIN agent_instances ai
          ON ai.id = arr.agent_instance_id
         AND ai.organization_id = arr.organization_id
        WHERE ai.type IN ('detail_page_generate', 'thumbnail_generate', 'image_edit')
      )
      UPDATE agent_run_requests request
      SET status = 'cancelled',
          finished_at = COALESCE(request.finished_at, now()),
          last_error_code = COALESCE(request.last_error_code, 'fixed_ai_agent_os_retired'),
          last_error_message = COALESCE(request.last_error_message, ${RETIRED_MESSAGE}),
          updated_at = now()
      FROM fixed_requests
      WHERE request.id = fixed_requests.id
        AND request.status NOT IN ('succeeded', 'failed', 'cancelled', 'skipped', 'coalesced')
    `;

    const disabledInstances = await tx.$executeRaw`
      UPDATE agent_instances
      SET lifecycle_status = 'disabled',
          pause_reason = COALESCE(pause_reason, 'Fixed AI job moved to direct AI execution.'),
          paused_at = COALESCE(paused_at, now()),
          updated_at = now()
      WHERE type IN ('detail_page_generate', 'thumbnail_generate', 'image_edit')
        AND lifecycle_status <> 'disabled'
    `;

    const cancelledContentGenerations = hasContentGenerations
      ? await tx.$executeRaw`
          WITH fixed_detail_requests AS (
            SELECT
              arr.organization_id,
              arr.source_resource_id
            FROM agent_run_requests arr
            JOIN agent_instances ai
              ON ai.id = arr.agent_instance_id
             AND ai.organization_id = arr.organization_id
            WHERE ai.type = 'detail_page_generate'
              AND arr.source_resource_type = 'content_generation'
              AND arr.source_resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          )
          UPDATE content_generations cg
          SET status = 'CANCELLED',
              error_message = COALESCE(cg.error_message, ${RETIRED_MESSAGE}),
              updated_at = now()
          FROM fixed_detail_requests request
          WHERE cg.organization_id = request.organization_id
            AND cg.id = request.source_resource_id::uuid
            AND cg.status IN ('PENDING', 'PROCESSING', 'pending', 'processing', 'generating')
        `
      : 0;

    const failedThumbnailGenerations = hasThumbnailGenerations
      ? await tx.$executeRaw`
          WITH fixed_thumbnail_requests AS (
            SELECT
              arr.organization_id,
              arr.source_resource_id
            FROM agent_run_requests arr
            JOIN agent_instances ai
              ON ai.id = arr.agent_instance_id
             AND ai.organization_id = arr.organization_id
            WHERE ai.type = 'thumbnail_generate'
              AND arr.source_resource_type = 'thumbnail_generation'
              AND arr.source_resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          )
          UPDATE thumbnail_generations tg
          SET status = 'failed',
              phase = NULL,
              error_message = COALESCE(tg.error_message, ${RETIRED_MESSAGE}),
              updated_at = now()
          FROM fixed_thumbnail_requests request
          WHERE tg.organization_id = request.organization_id
            AND tg.id = request.source_resource_id::uuid
            AND tg.status IN ('pending', 'running')
            AND tg.is_deleted = false
        `
      : 0;

    const closedAlerts = hasAlerts
      ? await tx.$executeRaw`
          WITH fixed_requests AS (
            SELECT
              arr.id,
              arr.organization_id,
              arr.source_resource_id,
              ai.type
            FROM agent_run_requests arr
            JOIN agent_instances ai
              ON ai.id = arr.agent_instance_id
             AND ai.organization_id = arr.organization_id
            WHERE ai.type IN ('detail_page_generate', 'thumbnail_generate', 'image_edit')
          )
          UPDATE alerts alert
          SET status = 'cancelled',
              severity = CASE
                WHEN alert.severity = 'critical' THEN alert.severity
                ELSE 'warning'
              END,
              message = COALESCE(alert.message, ${RETIRED_MESSAGE}),
              progress = COALESCE(alert.progress, 1),
              metadata = COALESCE(alert.metadata, '{}'::jsonb) || jsonb_build_object(
                'legacyAgentCleanup', true,
                'errorCode', 'fixed_ai_agent_os_retired'
              ),
              finished_at = COALESCE(alert.finished_at, now()),
              updated_at = now()
          FROM fixed_requests request
          WHERE alert.organization_id = request.organization_id
            AND alert.kind = 'operation'
            AND alert.status IN ('pending', 'running')
            AND (
              (alert.source_type = 'agent_run_request' AND alert.source_id = request.id::text)
              OR (
                request.type = 'detail_page_generate'
                AND alert.operation_key = 'detail-page:' || request.source_resource_id
              )
              OR (
                request.type = 'thumbnail_generate'
                AND alert.operation_key = 'thumbnail-edit:' || request.source_resource_id
              )
              OR (
                request.type = 'image_edit'
                AND alert.operation_key = 'image-edit:' || request.id::text
              )
            )
        `
      : 0;

    const [remaining] = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM agent_run_requests arr
      JOIN agent_instances ai
        ON ai.id = arr.agent_instance_id
       AND ai.organization_id = arr.organization_id
      WHERE ai.type IN ('detail_page_generate', 'thumbnail_generate', 'image_edit')
        AND arr.status NOT IN ('succeeded', 'failed', 'cancelled', 'skipped', 'coalesced')
    `;
    const remainingOpenRequests = Number(remaining?.count ?? 0n);
    if (remainingOpenRequests > 0) {
      throw new Error(
        `Invariant failed: ${remainingOpenRequests} retired fixed AI Agent OS request(s) remain non-terminal.`,
      );
    }

    return {
      affectedRows:
        cancelledRuns +
        cancelledRequests +
        disabledInstances +
        cancelledContentGenerations +
        failedThumbnailGenerations +
        closedAlerts,
      details: {
        cancelledRuns,
        cancelledRequests,
        disabledInstances,
        cancelledContentGenerations,
        failedThumbnailGenerations,
        closedAlerts,
        remainingOpenRequests,
      },
    };
  },
};

async function hasTable(tx: Prisma.TransactionClient, tableName: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  return Boolean(row?.exists);
}
