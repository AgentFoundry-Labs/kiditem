import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  closeGenerationsLeftByDirectJobCutoverMigration,
  DIRECT_JOB_CUTOVER_MESSAGE,
} from '../../../../../scripts/data-migrations/v0.1.31/036_close_generations_left_by_direct_job_cutover';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';

/**
 * KID-358 뒤 워커는 옛 `ai_direct_jobs`를 읽지 않는다. 옛 job이 아직 돌 차례였던(held · pending · running ·
 * projecting) 생성 기록은 영영 끝나지 않으므로 036이 실패로 닫는다. job 행은 건드리지 않는다. 표는 KID-365가
 * 같은 컷오버의 db push로 지우므로 036은 pre-schema에서 돌고, 표가 없는 DB(Office 0.1.30에는 `detail_pages`가
 * 없다)에서는 그 부분을 건너뛴다.
 */
describe('036 close generations left by the direct-job cutover (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  const run = () => prisma.$transaction((tx) => closeGenerationsLeftByDirectJobCutoverMigration.run(tx, { target: 'local' }));

  /** 표를 지운 DB에서 돌려 본 결과를 돌려주고, 지운 표는 되돌린다(PostgreSQL DDL은 트랜잭션 안에서 되돌려진다). */
  async function runWithoutTables(tables: string[]) {
    const rollback = new Error('rollback');
    let result: unknown;
    await prisma.$transaction(async (tx) => {
      for (const table of tables) await tx.$executeRawUnsafe(`DROP TABLE ${table} CASCADE`);
      result = await closeGenerationsLeftByDirectJobCutoverMigration.run(tx, { target: 'local' });
      throw rollback;
    }).catch((error: unknown) => { if (error !== rollback) throw error; });
    return result;
  }

  async function fixture() {
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: ORG, ownerType: 'direct_detail_page', normalizedTitle: 'cutover', status: 'active' },
      select: { id: true },
    });
    const thumbnail = (status: string) => prisma.thumbnailGeneration.create({
      data: { organizationId: ORG, contentWorkspaceId: workspace.id, status }, select: { id: true },
    });
    const page = (status: string) => prisma.detailPage.create({
      data: { organizationId: ORG, contentWorkspaceId: workspace.id, source: 'generated', status }, select: { id: true },
    });
    const job = (jobType: string, sourceResourceId: string, status: string) => prisma.aiDirectJob.create({
      data: { organizationId: ORG, jobType, sourceResourceId, status, payload: {} },
    });
    return { thumbnail, page, job };
  }

  it('fails every open generation whose old job was still waiting or running, and leaves the rest', async () => {
    const { thumbnail, page, job } = await fixture();
    const held = await thumbnail('pending');
    await job('thumbnail_generate', held.id, 'held');
    const running = await thumbnail('running');
    await job('thumbnail_generate', running.id, 'running');
    const reedit = await thumbnail('pending');
    await job('thumbnail_reedit', reedit.id, 'pending');
    const projecting = await page('processing');
    await job('detail_page_generate', projecting.id, 'projecting');
    const done = await thumbnail('succeeded');
    await job('thumbnail_generate', done.id, 'running');
    const finishedJob = await page('pending');
    await job('detail_page_generate', finishedJob.id, 'failed');
    const noJob = await thumbnail('pending');

    await expect(run()).resolves.toMatchObject({ affectedRows: 4, details: { thumbnailGenerations: 3, detailPages: 1 } });

    for (const { id } of [held, running, reedit]) {
      await expect(prisma.thumbnailGeneration.findUniqueOrThrow({ where: { id }, select: { status: true, errorMessage: true } }))
        .resolves.toEqual({ status: 'failed', errorMessage: DIRECT_JOB_CUTOVER_MESSAGE });
    }
    await expect(prisma.detailPage.findUniqueOrThrow({ where: { id: projecting.id }, select: { status: true, errorMessage: true } }))
      .resolves.toEqual({ status: 'failed', errorMessage: DIRECT_JOB_CUTOVER_MESSAGE });
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({ where: { id: done.id } })).resolves.toMatchObject({ status: 'succeeded' });
    await expect(prisma.detailPage.findUniqueOrThrow({ where: { id: finishedJob.id } })).resolves.toMatchObject({ status: 'pending' });
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({ where: { id: noJob.id } })).resolves.toMatchObject({ status: 'pending' });
    // job 행은 그대로다.
    await expect(prisma.aiDirectJob.count({ where: { status: { in: ['held', 'pending', 'running', 'projecting'] } } })).resolves.toBe(5);
  });

  it('runs before the schema step, which drops ai_direct_jobs', () => {
    expect(closeGenerationsLeftByDirectJobCutoverMigration.phase).toBe('pre-schema');
  });

  it('closes the thumbnails and skips the detail pages on a database without detail_pages (Office 0.1.30)', async () => {
    const { thumbnail, job } = await fixture();
    const held = await thumbnail('pending');
    await job('thumbnail_generate', held.id, 'held');

    await expect(runWithoutTables(['detail_pages'])).resolves.toEqual({
      affectedRows: 1,
      details: { thumbnailGenerations: 1, detailPages: 0, skippedTables: ['detail_pages'] },
    });
  });

  it('changes nothing on a database that never had ai_direct_jobs', async () => {
    const { thumbnail } = await fixture();
    await thumbnail('pending');

    await expect(runWithoutTables(['ai_direct_jobs'])).resolves.toEqual({
      affectedRows: 0,
      details: { thumbnailGenerations: 0, detailPages: 0, skippedTables: ['ai_direct_jobs'] },
    });
  });

  it('changes nothing when run again', async () => {
    const { thumbnail, job } = await fixture();
    const held = await thumbnail('pending');
    await job('thumbnail_generate', held.id, 'held');
    await run();
    await expect(run()).resolves.toMatchObject({ affectedRows: 0 });
  });
});
