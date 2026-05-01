/**
 * Real Postgres integration test for ActionBoardService.claim race guard.
 *
 * 보완 대상 허수 (audit 2026-04-17 P1-3):
 *   action-board-claim.spec.ts 의 race 테스트는 mock `count=0` 만 확인.
 *   실제 두 사용자가 동시에 claim 시도할 때 정확히 하나만 성공하는지 미검증.
 *
 * 이 파일은 실제 Postgres 동시 updateMany 경쟁을 재현:
 *   - 두 유저가 동시 claim → 정확히 한 명만 assigneeUserId 세팅
 *   - 다른 한 명은 ConflictException
 *   - unclaim 도 마찬가지: 다른 사람의 task 를 unclaim 시도하면 실패
 *   - IDOR: 다른 회사의 task 를 claim 시도하면 실패
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient, ActionTask } from '@prisma/client';

import { ActionBoardService } from '../action-board.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
} from '../../../../test-helpers/real-prisma';

async function seedTask(prisma: PrismaClient, overrides: Partial<ActionTask> = {}) {
  return prisma.actionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      taskKey: 'test-task',
      type: 'human',
      label: 'Test',
      priority: 'medium',
      status: 'pending',
      date: new Date('2026-04-17T00:00:00Z'),
      assigneeUserId: null,
      ...overrides,
    } as any,
  });
}

describe('ActionBoardService.claim/unclaim — real Postgres race guard', () => {
  let prisma: PrismaClient;
  let service: ActionBoardService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    service = new ActionBoardService(prisma as any);
  });

  it('단일 claim → assigneeUserId 세팅', async () => {
    const task = await seedTask(prisma);

    const result = await service.claim(task.id, TEST_ORGANIZATION_ID, TEST_USER_ID);
    expect(result.assigneeUserId).toBe(TEST_USER_ID);

    const db = await prisma.actionTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(db.assigneeUserId).toBe(TEST_USER_ID);
  });

  it('두 유저 동시 claim → 한 명만 성공, 다른 한 명은 ConflictException', async () => {
    const task = await seedTask(prisma);

    const results = await Promise.allSettled([
      service.claim(task.id, TEST_ORGANIZATION_ID, TEST_USER_ID),
      service.claim(task.id, TEST_ORGANIZATION_ID, OTHER_USER_ID),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    // DB 상태: assignee 정확히 한 명, 성공한 유저와 동일
    const db = await prisma.actionTask.findUniqueOrThrow({ where: { id: task.id } });
    const winnerUserId = (fulfilled[0] as PromiseFulfilledResult<{ assigneeUserId: string | null }>)
      .value.assigneeUserId;
    expect(db.assigneeUserId).toBe(winnerUserId);
  });

  it('이미 claim 된 task 재시도 → ConflictException', async () => {
    const task = await seedTask(prisma);
    await service.claim(task.id, TEST_ORGANIZATION_ID, TEST_USER_ID);

    await expect(
      service.claim(task.id, TEST_ORGANIZATION_ID, OTHER_USER_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('다른 회사의 task claim 시도 → ConflictException (IDOR 방어)', async () => {
    const task = await seedTask(prisma);

    await expect(
      service.claim(task.id, OTHER_ORGANIZATION_ID, OTHER_USER_ID),
    ).rejects.toBeInstanceOf(ConflictException);

    const db = await prisma.actionTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(db.assigneeUserId).toBeNull();
  });

  it('unclaim — 본인 task 만 해제 가능, 타인의 task 는 ConflictException', async () => {
    const task = await seedTask(prisma, { assigneeUserId: TEST_USER_ID } as any);

    // 다른 유저가 unclaim 시도 → ConflictException
    await expect(
      service.unclaim(task.id, TEST_ORGANIZATION_ID, OTHER_USER_ID),
    ).rejects.toBeInstanceOf(ConflictException);

    // 본인이 unclaim → 성공
    const result = await service.unclaim(task.id, TEST_ORGANIZATION_ID, TEST_USER_ID);
    expect(result.assigneeUserId).toBeNull();
  });

  it('claim + unclaim + reclaim 순환 — 동시성 없이도 일관성', async () => {
    const task = await seedTask(prisma);

    await service.claim(task.id, TEST_ORGANIZATION_ID, TEST_USER_ID);
    await service.unclaim(task.id, TEST_ORGANIZATION_ID, TEST_USER_ID);
    const final = await service.claim(task.id, TEST_ORGANIZATION_ID, OTHER_USER_ID);

    expect(final.assigneeUserId).toBe(OTHER_USER_ID);
  });
});
