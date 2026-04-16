/**
 * Real Postgres integration test for Panel/Alert promote race guard.
 *
 * 보완 대상 허수 (audit 2026-04-17 P0-1):
 *   panel-pr3.integration.spec.ts 의 race guard 테스트는 mock Prisma `count=0`
 *   반환으로 "분기 타는지"만 검증. 실제 동시 트랜잭션에서 race 감지 여부는 미검증.
 *
 * 이 파일은 실제 Postgres 에 대해:
 *   - 두 요청이 동시에 같은 alert 를 promote 하면 **정확히 하나만 성공**
 *   - 다른 하나는 ConflictException (P2002 또는 updateMany count=0)
 *   - 레이스 후에도 DB 상태가 일관적 (actionTask 하나만 존재, alert.actionTaskId 매칭)
 *
 * 실행:
 *   npm run db:test:up && npm run db:test:prepare && npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { AlertsService } from '../../rules/services/alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  TEST_USER_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

const ALERT_ID = 'aaaaaaaa-1111-4000-8000-000000000001';

function alertSeed(overrides: Record<string, unknown> = {}) {
  return {
    id: ALERT_ID,
    companyId: TEST_COMPANY_ID,
    type: 'rule_violation',
    severity: 'warning' as const,
    title: 'Low CTR',
    message: 'Sample detail',
    isRead: false,
    actionTaskId: null as string | null,
    ...overrides,
  };
}

describe('Alerts.promote — real Postgres race guard', () => {
  let prisma: PrismaClient;
  let service: AlertsService;
  let emitter: EventEmitter2;

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
    emitter = new EventEmitter2();
    service = new AlertsService(prisma as any, emitter);
  });

  it('단일 promote → ActionTask 생성 + alert.actionTaskId 매칭', async () => {
    await prisma.alert.create({ data: alertSeed() });

    const { task, updatedAlert } = await service.promote(
      ALERT_ID,
      TEST_COMPANY_ID,
      {},
      TEST_USER_ID,
    );

    expect(task.id).toBeTruthy();
    expect(task.companyId).toBe(TEST_COMPANY_ID);
    expect(updatedAlert.actionTaskId).toBe(task.id);

    const db = await prisma.alert.findUniqueOrThrow({ where: { id: ALERT_ID } });
    expect(db.actionTaskId).toBe(task.id);
    const taskRows = await prisma.actionTask.count({ where: { companyId: TEST_COMPANY_ID } });
    expect(taskRows).toBe(1);
  });

  it('동시 2건 promote → 정확히 하나만 성공, 다른 하나는 ConflictException (race)', async () => {
    await prisma.alert.create({ data: alertSeed() });

    // 두 promote 를 동시에 발사 — 실제 Postgres 동시 트랜잭션 경쟁 발생
    const results = await Promise.allSettled([
      service.promote(ALERT_ID, TEST_COMPANY_ID, {}, TEST_USER_ID),
      service.promote(ALERT_ID, TEST_COMPANY_ID, {}, TEST_USER_ID),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // 정확히 하나 성공, 하나 실패
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // 실패는 ConflictException (P2002 or count=0 branch)
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ConflictException);

    // DB 상태: ActionTask 정확히 1개, alert.actionTaskId 는 그 task id
    const taskCount = await prisma.actionTask.count({ where: { companyId: TEST_COMPANY_ID } });
    expect(taskCount).toBe(1);

    const tasks = await prisma.actionTask.findMany({ where: { companyId: TEST_COMPANY_ID } });
    const alertRow = await prisma.alert.findUniqueOrThrow({ where: { id: ALERT_ID } });
    expect(alertRow.actionTaskId).toBe(tasks[0].id);
  });

  it('5건 동시 promote → 1건만 성공 (스트레스)', async () => {
    await prisma.alert.create({ data: alertSeed() });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.promote(ALERT_ID, TEST_COMPANY_ID, {}, TEST_USER_ID),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    }

    const taskCount = await prisma.actionTask.count({ where: { companyId: TEST_COMPANY_ID } });
    expect(taskCount).toBe(1);
  });

  it('이미 promote 된 alert 재시도 → ConflictException (not race — explicit guard)', async () => {
    await prisma.alert.create({ data: alertSeed() });

    // 첫 promote 성공
    await service.promote(ALERT_ID, TEST_COMPANY_ID, {}, TEST_USER_ID);

    // 두 번째 promote → actionTaskId 존재 체크에서 차단
    await expect(
      service.promote(ALERT_ID, TEST_COMPANY_ID, {}, TEST_USER_ID),
    ).rejects.toBeInstanceOf(ConflictException);

    const taskCount = await prisma.actionTask.count({ where: { companyId: TEST_COMPANY_ID } });
    expect(taskCount).toBe(1);
  });

  it('다른 회사의 alert promote 시도 → NotFoundException (IDOR 방어)', async () => {
    await prisma.alert.create({ data: alertSeed({ companyId: TEST_COMPANY_ID }) });

    // OTHER_COMPANY_ID 로 접근
    await expect(
      service.promote(ALERT_ID, OTHER_COMPANY_ID, {}, TEST_USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    const taskCount = await prisma.actionTask.count();
    expect(taskCount).toBe(0);

    const alertRow = await prisma.alert.findUniqueOrThrow({ where: { id: ALERT_ID } });
    expect(alertRow.actionTaskId).toBeNull(); // 변경 없음
  });

  it('존재하지 않는 alert → NotFoundException', async () => {
    await expect(
      service.promote('00000000-0000-4000-8000-000000000999', TEST_COMPANY_ID, {}, TEST_USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
