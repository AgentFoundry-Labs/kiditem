/**
 * PR3 integration test — Panel SSE pipeline for promote/dismiss/list (Task 35)
 *
 * Tests with real EventEmitter2 bus + real service instances (AlertsService,
 * ActionBoardService, PanelSseService) wired via NestJS Test module.
 * Prisma is mocked (for fast feedback on SSE wire shape + filter branches).
 *
 * Scenarios covered here (SSE/filter focus, mock Prisma is sufficient):
 *   1. Promote emit — promote() → SSE UPSERT event arrives with item.actionTaskId
 *   3. Dismiss emit/not-found — SSE DISMISS event shape + NotFoundException
 *   5. list(me|team|all) filter branches + sourceAlert join
 *   6. No N+1 — list() calls prisma.alert.findMany ≤ 1 time
 *   + Cross-organization stream isolation (organizationId filter)
 *
 * Race / IDOR scenarios moved out: 실제 동시 트랜잭션은 sibling spec
 * `panel-pr3.pg.integration.spec.ts` + `action-board-claim.pg.integration.spec.ts`
 * (real Postgres via docker-compose.test.yml) 가 커버. 구버전의 Scenario
 * 2/2b/4/4b (mock count=0 시뮬레이션) 는 대체됐으므로 제거.
 *
 * Mock boundary: PrismaService only.
 * Real: EventEmitter2 (global bus), PanelSseService, AlertsService, ActionBoardService.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';

import { PanelSseService } from '../panel-sse.service';
import { PANEL_EVENTS } from '../panel-events';
import { AlertsService } from '../../../../application/service/alerts.service';
import { ActionBoardService } from '../../../../application/service/action-board.service';
import { PrismaService } from '../../../../../prisma/prisma.service';

// ── Constants ──────────────────────────────────────────────────────────────

const CO = 'co-test-1';
const ALERT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TASK_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const USER_A = 'cccccccc-0000-4000-8000-000000000003';
const USER_B = 'dddddddd-0000-4000-8000-000000000004';

// ── Fixtures ───────────────────────────────────────────────────────────────

function alertFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ALERT_ID,
    organizationId: CO,
    productId: null,
    type: 'rule_violation',
    severity: 'warning',
    title: 'Test alert',
    message: 'Low CTR detected',
    isRead: false,
    actionTaskId: null,
    createdAt: new Date('2026-04-16T00:00:00Z'),
    ...overrides,
  };
}

function taskFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    organizationId: CO,
    taskKey: `promoted:${ALERT_ID}`,
    type: 'human',
    label: 'Test alert',
    detail: 'Low CTR detected',
    priority: 'medium',
    role: 'data',
    status: 'pending',
    date: new Date('2026-04-15T15:00:00Z'),
    assigneeUserId: null,
    assigneeUser: null,
    where: null,
    href: null,
    apiCall: null,
    notes: [],
    activityLog: [],
    result: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Module builder ─────────────────────────────────────────────────────────

function makePrisma() {
  return {
    alert: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    actionTask: {
      create: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    // $transaction runs the callback with a tx proxy
    $transaction: vi.fn(),
  };
}

async function buildModule(prismaOverride?: ReturnType<typeof makePrisma>): Promise<{
  moduleRef: TestingModule;
  sseService: PanelSseService;
  alertsService: AlertsService;
  actionBoardService: ActionBoardService;
  emitter: EventEmitter2;
  prisma: ReturnType<typeof makePrisma>;
}> {
  const prisma = prismaOverride ?? makePrisma();

  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot()],
    providers: [
      PanelSseService,
      AlertsService,
      ActionBoardService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  await moduleRef.init();

  return {
    moduleRef,
    sseService: moduleRef.get(PanelSseService),
    alertsService: moduleRef.get(AlertsService),
    actionBoardService: moduleRef.get(ActionBoardService),
    emitter: moduleRef.get(EventEmitter2),
    prisma,
  };
}

// Wire $transaction to run the callback with a tx proxy (mirrors tx mock in unit test)
function wireTransaction(prisma: ReturnType<typeof makePrisma>, txOverrides: Partial<ReturnType<typeof makePrisma>> = {}) {
  const tx = { ...prisma, ...txOverrides };
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(tx));
  return tx;
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('Panel PR3 integration — promote/dismiss/claim/list (Task 35)', () => {
  let ctx: Awaited<ReturnType<typeof buildModule>>;

  beforeEach(async () => {
    ctx = await buildModule();
  });

  afterEach(async () => {
    await ctx.moduleRef.close();
  });

  // ── Scenario 1: Promote emit ─────────────────────────────────────────────

  it('Scenario 1: promote() → SSE UPSERT event arrives; item.actionTaskId matches new task.id', async () => {
    const { sseService, alertsService, prisma } = ctx;

    const tx = wireTransaction(prisma);
    tx.alert.findFirst = vi.fn().mockResolvedValue(alertFixture());
    tx.actionTask.create = vi.fn().mockResolvedValue(taskFixture());
    tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

    // Subscribe to stream BEFORE triggering the action
    const stream$ = sseService.getStream(CO).pipe(take(1), toArray());
    const collectPromise = lastValueFrom(stream$);

    await alertsService.promote(ALERT_ID, CO, {}, USER_A);

    const events = await collectPromise;
    expect(events).toHaveLength(1);

    const event = (events[0] as any).data;
    expect(event.type).toBe('upsert');
    expect(event.item.kind).toBe('alert');
    expect(event.item.id).toBe(ALERT_ID);
    // actionTaskId should be set after promote — adapter maps it from updatedAlert
    expect(event.item.actionTaskId).toBe(TASK_ID);
  });

  // Scenarios 2 / 2b (promote race mock simulation) 는 real Postgres spec
  // (`panel-pr3.pg.integration.spec.ts` — "동시 2건 promote" / "5건 스트레스")
  // 이 더 강력하게 커버하므로 제거.

  // ── Scenario 3: Dismiss emit ─────────────────────────────────────────────

  it('Scenario 3: dismiss() → SSE DISMISS event arrives with itemId and no organizationId leak', async () => {
    const { sseService, alertsService, prisma } = ctx;

    prisma.alert.updateMany.mockResolvedValue({ count: 1 });

    // Subscribe to stream BEFORE triggering
    const stream$ = sseService.getStream(CO).pipe(take(1), toArray());
    const collectPromise = lastValueFrom(stream$);

    await alertsService.dismiss(ALERT_ID, CO);

    const events = await collectPromise;
    expect(events).toHaveLength(1);

    const event = (events[0] as any).data;
    expect(event.type).toBe('dismiss');
    expect(event.itemId).toBe(ALERT_ID);
    // organizationId must NOT be in the outbound wire event (strip at PanelSseService)
    expect(event.organizationId).toBeUndefined();
  });

  it('Scenario 3b: dismiss() not found → NotFoundException; no SSE emit', async () => {
    const { alertsService, prisma } = ctx;

    prisma.alert.updateMany.mockResolvedValue({ count: 0 });

    const emitted: unknown[] = [];
    ctx.emitter.on(PANEL_EVENTS.DISMISS, (p) => emitted.push(p));

    await expect(alertsService.dismiss(ALERT_ID, CO)).rejects.toThrow(NotFoundException);
    expect(emitted).toHaveLength(0);
  });

  // Scenarios 4 / 4b (claim race + IDOR mock) 는 real Postgres spec
  // (`action-board-claim.pg.integration.spec.ts` — "두 유저 동시 claim" /
  //  "다른 회사의 task claim → ConflictException") 이 대체하므로 제거.

  // ── Scenario 5: list(me|team|all) filter branches + sourceAlert join ─────

  it('Scenario 5a: list(me) — where.assigneeUserId === currentUserId', async () => {
    const { actionBoardService, prisma } = ctx;

    prisma.actionTask.findMany.mockResolvedValue([]);
    // alert.findMany not called when tasks empty
    prisma.alert.findMany.mockResolvedValue([]);

    await actionBoardService.list(CO, USER_A, { assignedTo: 'me' });

    const whereArg = prisma.actionTask.findMany.mock.calls[0][0].where;
    expect(whereArg.organizationId).toBe(CO);
    expect(whereArg.assigneeUserId).toBe(USER_A);
  });

  it('Scenario 5b: list(team) — excludes current user, requires non-null assignee', async () => {
    const { actionBoardService, prisma } = ctx;

    prisma.actionTask.findMany.mockResolvedValue([]);
    prisma.alert.findMany.mockResolvedValue([]);

    await actionBoardService.list(CO, USER_A, { assignedTo: 'team' });

    const whereArg = prisma.actionTask.findMany.mock.calls[0][0].where;
    expect(whereArg.organizationId).toBe(CO);
    expect(whereArg.AND).toEqual(
      expect.arrayContaining([
        { assigneeUserId: { not: null } },
        { assigneeUserId: { not: USER_A } },
      ]),
    );
  });

  it('Scenario 5c: list(all) — no assigneeUserId filter applied', async () => {
    const { actionBoardService, prisma } = ctx;

    prisma.actionTask.findMany.mockResolvedValue([]);
    prisma.alert.findMany.mockResolvedValue([]);

    await actionBoardService.list(CO, USER_A); // default = 'all'

    const whereArg = prisma.actionTask.findMany.mock.calls[0][0].where;
    expect(whereArg.organizationId).toBe(CO);
    expect(whereArg.assigneeUserId).toBeUndefined();
    expect(whereArg.AND).toBeUndefined();
  });

  it('Scenario 5d: sourceAlert joined correctly — alertByTaskId map populates sourceAlert', async () => {
    const { actionBoardService, prisma } = ctx;

    const task1 = taskFixture({ id: 'task-x1' });
    const task2 = taskFixture({ id: 'task-x2' });
    prisma.actionTask.findMany.mockResolvedValue([task1, task2]);

    const sourceAlert = {
      id: 'a-src-1',
      actionTaskId: 'task-x1',
      severity: 'warning',
      type: 'rule_violation',
      title: 'Test alert',
    };
    prisma.alert.findMany.mockResolvedValue([sourceAlert]);

    const results = await actionBoardService.list(CO, USER_A);

    expect(results).toHaveLength(2);
    const withAlert = results.find((t) => t.id === 'task-x1');
    const withoutAlert = results.find((t) => t.id === 'task-x2');

    expect(withAlert?.sourceAlert).toEqual(sourceAlert);
    expect(withoutAlert?.sourceAlert).toBeNull();
  });

  // ── Scenario 6: No N+1 ───────────────────────────────────────────────────

  it('Scenario 6: list() calls prisma.alert.findMany exactly once regardless of task count', async () => {
    const { actionBoardService, prisma } = ctx;

    // 5 tasks
    const tasks = Array.from({ length: 5 }, (_, i) => taskFixture({ id: `task-n${i}` }));
    prisma.actionTask.findMany.mockResolvedValue(tasks);
    prisma.alert.findMany.mockResolvedValue([]);

    const alertFindManySpy = vi.spyOn(prisma.alert, 'findMany');

    await actionBoardService.list(CO, USER_A);

    // Exactly 1 batch-load call — no per-task individual queries
    expect(alertFindManySpy).toHaveBeenCalledTimes(1);

    const batchWhere = alertFindManySpy.mock.calls[0][0].where;
    expect(batchWhere.actionTaskId).toEqual({
      in: tasks.map((t) => t.id),
    });
  });

  it('Scenario 6b: list() with empty task result skips alert.findMany entirely', async () => {
    const { actionBoardService, prisma } = ctx;

    prisma.actionTask.findMany.mockResolvedValue([]);

    const alertFindManySpy = vi.spyOn(prisma.alert, 'findMany');

    await actionBoardService.list(CO, USER_A);

    expect(alertFindManySpy).not.toHaveBeenCalled();
  });

  // ── Cross-organization isolation (dismiss event) ──────────────────────────────

  it('Dismiss event for co-A does NOT appear in co-B stream', async () => {
    const { sseService, alertsService, prisma } = ctx;

    prisma.alert.updateMany.mockResolvedValue({ count: 1 });

    // co-B subscribes
    const streamB$ = sseService.getStream('co-B').pipe(take(1), toArray());
    // This promise must NOT resolve (no co-B events should arrive)
    let coBGotEvent = false;
    lastValueFrom(streamB$).then(() => { coBGotEvent = true; });

    // co-A promotes and dismisses its own alert
    const txForPromote = wireTransaction(prisma);
    txForPromote.alert.findFirst = vi.fn().mockResolvedValue(alertFixture({ organizationId: CO }));
    txForPromote.actionTask.create = vi.fn().mockResolvedValue(taskFixture());
    txForPromote.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

    // listen to co-A dismiss stream
    const streamA$ = sseService.getStream(CO).pipe(take(1), toArray());
    const collectA = lastValueFrom(streamA$);

    await alertsService.dismiss(ALERT_ID, CO);

    const eventsA = await collectA;
    expect(eventsA).toHaveLength(1);
    expect((eventsA[0] as any).data.type).toBe('dismiss');

    // co-B stream should NOT have received anything
    expect(coBGotEvent).toBe(false);
  });
});
