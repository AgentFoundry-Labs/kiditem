import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionBoardService } from '../action-board.service';
import { ActionBoardRepositoryAdapter } from '../../../adapter/out/repository/action-board.repository.adapter';

function makePrisma() {
  return {
    actionTask: {
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
    },
  };
}

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    organizationId: 'c-1',
    taskKey: 'h-reorder',
    status: 'pending',
    priority: 'high',
    date: new Date('2026-04-16'),
    activityLog: [],
    notes: [],
    apiCall: null,
    assigneeUserId: null,
    assigneeUser: null,
    ...overrides,
  };
}

describe('ActionBoardService — claim/unclaim/list', () => {
  let service: ActionBoardService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ActionBoardService(
      new ActionBoardRepositoryAdapter(prisma as any),
    );
  });

  // ── claim ─────────────────────────────────────────────────────────────────

  describe('claim', () => {
    it('happy path: updateMany count=1 → returns task with assigneeUser join', async () => {
      prisma.actionTask.updateMany.mockResolvedValue({ count: 1 });
      const assigned = baseTask({ assigneeUserId: 'u-1', assigneeUser: { id: 'u-1', name: 'Alice' } });
      prisma.actionTask.findFirstOrThrow.mockResolvedValue(assigned);

      const result = await service.claim('task-1', 'c-1', 'u-1');

      expect(prisma.actionTask.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-1', organizationId: 'c-1', assigneeUserId: null },
        data: { assigneeUserId: 'u-1' },
      });
      expect(result.assigneeUser).toEqual({ id: 'u-1', name: 'Alice' });
    });

    // race condition (updateMany count=0) + organization scope IDOR 는 real Postgres
    // spec (`action-board-claim.pg.integration.spec.ts` — "두 유저 동시 claim" /
    //  "다른 회사의 task claim → ConflictException") 이 대체하므로 제거.
  });

  // ── unclaim ───────────────────────────────────────────────────────────────

  describe('unclaim', () => {
    it('happy path: updateMany count=1 → assigneeUserId null reset', async () => {
      prisma.actionTask.updateMany.mockResolvedValue({ count: 1 });
      const released = baseTask({ assigneeUserId: null, assigneeUser: null });
      prisma.actionTask.findFirstOrThrow.mockResolvedValue(released);

      const result = await service.unclaim('task-1', 'c-1', 'u-1');

      expect(prisma.actionTask.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-1', organizationId: 'c-1', assigneeUserId: 'u-1' },
        data: { assigneeUserId: null },
      });
      expect(result.assigneeUserId).toBeNull();
    });

    // ownership guard (다른 유저의 task unclaim → ConflictException) 는 real
    // Postgres spec ("unclaim — 본인 task 만 해제 가능, 타인의 task 는
    // ConflictException") 가 대체하므로 제거.
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('assignedTo=me: where includes assigneeUserId=currentUserId', async () => {
      prisma.actionTask.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.list('c-1', 'u-1', { assignedTo: 'me' });

      const whereArg = prisma.actionTask.findMany.mock.calls[0][0].where;
      expect(whereArg.assigneeUserId).toBe('u-1');
    });

    it('assignedTo=team: where excludes current user but requires non-null assignee', async () => {
      prisma.actionTask.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.list('c-1', 'u-1', { assignedTo: 'team' });

      const whereArg = prisma.actionTask.findMany.mock.calls[0][0].where;
      expect(whereArg.AND).toEqual(
        expect.arrayContaining([
          { assigneeUserId: { not: null } },
          { assigneeUserId: { not: 'u-1' } },
        ]),
      );
    });

    it('assignedTo=all (default): no assigneeUserId filter', async () => {
      prisma.actionTask.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.list('c-1', 'u-1');

      const whereArg = prisma.actionTask.findMany.mock.calls[0][0].where;
      expect(whereArg.assigneeUserId).toBeUndefined();
      expect(whereArg.AND).toBeUndefined();
    });

    it('batch-load: alert findMany called once with actionTaskId in array', async () => {
      const tasks = [baseTask({ id: 'task-1' }), baseTask({ id: 'task-2' })];
      prisma.actionTask.findMany.mockResolvedValue(tasks);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.list('c-1', 'u-1');

      expect(prisma.alert.findMany).toHaveBeenCalledTimes(1);
      const alertWhere = prisma.alert.findMany.mock.calls[0][0].where;
      expect(alertWhere.actionTaskId).toEqual({ in: ['task-1', 'task-2'] });
    });

    it('sourceAlert attached correctly when alert matches taskId', async () => {
      const tasks = [baseTask({ id: 'task-1' })];
      prisma.actionTask.findMany.mockResolvedValue(tasks);
      const alert = { id: 'a-1', actionTaskId: 'task-1', severity: 'high', type: 'profit', title: 'Low margin' };
      prisma.alert.findMany.mockResolvedValue([alert]);

      const result = await service.list('c-1', 'u-1');

      expect(result[0].sourceAlert).toEqual(alert);
    });

    it('empty taskIds: alert findMany not called', async () => {
      prisma.actionTask.findMany.mockResolvedValue([]);

      await service.list('c-1', 'u-1');

      expect(prisma.alert.findMany).not.toHaveBeenCalled();
    });
  });
});
