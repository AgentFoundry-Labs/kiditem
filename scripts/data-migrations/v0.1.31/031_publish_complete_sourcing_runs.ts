import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/**
 * KID-360: 소싱 리더는 run 표 대신 발행 이력 표(`sourcing_source_publications`)만 읽는다. 옛 COMPLETE run 하나를
 * 발행 1행으로 옮긴다: operationId = run id(원장 행의 `operation_id`가 이미 이 값이다), plan = attempt_plan,
 * 창·건수·coverage·checksum·qualityReport·completedAt 그대로, isCurrent = is_current_complete.
 *
 * 스키마 단계 뒤(표가 생긴 뒤)에 돈다. 이미 옮긴 run은 (organization, operation) unique로 건너뛰므로 다시
 * 돌리면 아무것도 바꾸지 않는다. run 표는 서버 구동 kind가 옮겨질 때까지(KID-360 I-b) 남는다.
 */
export async function publishCompleteSourcingRuns(tx: Prisma.TransactionClient): Promise<MigrationResult> {
  const published = await tx.$executeRaw`
    INSERT INTO sourcing_source_publications (
      id, organization_id, source_key, scope_key, target_key, operation_id, is_current, plan,
      window_start_at, window_end_at, discovered_count, accepted_count, duplicate_count,
      coverage_numerator, coverage_denominator, content_checksum, quality_report, completed_at, created_at
    )
    SELECT
      gen_random_uuid(), run.organization_id, run.source_key, run.scope_key, run.target_key, run.id,
      run.is_current_complete, run.attempt_plan, run.source_window_start_at, run.source_window_end_at,
      run.discovered_count, run.accepted_count, run.duplicate_count, run.coverage_numerator,
      run.coverage_denominator, run.content_checksum, run.quality_report, run.completed_at, now()
    FROM sourcing_evidence_ingestion_runs run
    WHERE run.status = 'COMPLETE'
      AND run.completed_at IS NOT NULL
    ON CONFLICT (organization_id, operation_id) DO NOTHING
  `;
  return { affectedRows: published, details: { published } };
}

export const publishCompleteSourcingRunsMigration: DataMigration = {
  id: 'v0.1.31:031_publish_complete_sourcing_runs',
  releaseVersion: '0.1.31',
  name: 'Copy complete sourcing ingestion runs into the source publication ledger',
  phase: 'post-schema',
  run: publishCompleteSourcingRuns,
};
