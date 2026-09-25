import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  closeGenerationsLeftByDirectJobCutoverMigration,
  DIRECT_JOB_CUTOVER_MESSAGE,
} from '../../../../../scripts/data-migrations/v0.1.31/029_close_generations_left_by_direct_job_cutover';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';

/**
 * KID-358 뒤 워커는 옛 `ai_direct_jobs`를 읽지 않는다. 옛 job이 아직 돌 차례였던(held · pending · running ·
 * projecting) 생성 기록은 영영 끝나지 않으므로 029가 실패로 닫는다. job 행은 건드리지 않는다(drop은 KID-365).
 */
describe('029 close generations left by the direct-job cutover (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = makeTestPrisma(); await prisma.$connect(); });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  const run = () => prisma.$transaction((tx) => closeGenerationsLeftByDirectJobCutoverMigration.run(tx, { target: 'local' }));

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

  it('changes nothing when run again', async () => {
    const { thumbnail, job } = await fixture();
    const held = await thumbnail('pending');
    await job('thumbnail_generate', held.id, 'held');
    await run();
    await expect(run()).resolves.toMatchObject({ affectedRows: 0 });
  });
});
