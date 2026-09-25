import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

/** 운영자가 생성 기록에서 읽는 문장. */
export const DIRECT_JOB_CUTOVER_MESSAGE = '실행 계약 이관으로 중단됐습니다. 다시 생성해 주세요.';

/**
 * KID-358 뒤 AI 생성 워커는 `content.*` 실행만 집고 옛 `ai_direct_jobs`를 읽지 않는다. 배포 때 옛 job이
 * 아직 돌 차례였던(held · pending · running · projecting) 썸네일 생성 · 재편집과 상세 생성 기록은 영영 끝나지
 * 않으므로 운영자 문장과 함께 `failed`로 닫는다. 운영자는 다시 생성한다.
 *
 * - 열린 기록만 닫는다: 썸네일 `pending` · `running`, 상세 `pending` · `processing`(지워진 기록 제외).
 * - 조직이 같은 job과 기록만 잇는다. job 행은 건드리지 않는다(표 drop은 KID-365).
 * - 다시 돌리면 닫을 열린 기록이 없어 아무것도 바꾸지 않는다.
 */
export async function closeGenerationsLeftByDirectJobCutover(tx: Prisma.TransactionClient): Promise<MigrationResult> {
  const thumbnailGenerations = await tx.$executeRaw`
    UPDATE thumbnail_generations AS generation
    SET status = 'failed', error_message = ${DIRECT_JOB_CUTOVER_MESSAGE}, updated_at = now()
    WHERE generation.status IN ('pending', 'running')
      AND generation.is_deleted = false
      AND EXISTS (
        SELECT 1 FROM ai_direct_jobs job
        WHERE job.organization_id = generation.organization_id
          AND job.source_resource_id = generation.id
          AND job.job_type IN ('thumbnail_generate', 'thumbnail_reedit')
          AND job.status IN ('held', 'pending', 'running', 'projecting')
      )
  `;
  const detailPages = await tx.$executeRaw`
    UPDATE detail_pages AS page
    SET status = 'failed', error_message = ${DIRECT_JOB_CUTOVER_MESSAGE}, updated_at = now()
    WHERE page.status IN ('pending', 'processing')
      AND page.is_deleted = false
      AND EXISTS (
        SELECT 1 FROM ai_direct_jobs job
        WHERE job.organization_id = page.organization_id
          AND job.source_resource_id = page.id
          AND job.job_type = 'detail_page_generate'
          AND job.status IN ('held', 'pending', 'running', 'projecting')
      )
  `;
  return {
    affectedRows: thumbnailGenerations + detailPages,
    details: { thumbnailGenerations, detailPages },
  };
}

export const closeGenerationsLeftByDirectJobCutoverMigration: DataMigration = {
  id: 'v0.1.31:029_close_generations_left_by_direct_job_cutover',
  releaseVersion: '0.1.31',
  name: 'Close AI generations whose direct job the operation contract no longer runs',
  phase: 'post-schema',
  run: closeGenerationsLeftByDirectJobCutover,
};
