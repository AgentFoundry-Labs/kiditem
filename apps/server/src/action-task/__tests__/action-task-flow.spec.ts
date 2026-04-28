import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionTaskService } from '../action-task.service';
import { NotFoundException } from '@nestjs/common';
import { ActionTaskSchema } from '@kiditem/shared';

function makePrisma() {
  return {
    actionTask: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
  };
}

function baseTask() {
  return {
    id: 'task-1',
    companyId: 'c-1',
    taskKey: 'h-reorder',
    status: 'pending',
    priority: 'high',
    activityLog: [],
    notes: [],
    apiCall: null,
  };
}

describe('ActionTaskService — task 상태 전이', () => {
  let service: ActionTaskService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma = makePrisma();
    service = new ActionTaskService(prisma as any);
  });

  describe('updateTask', () => {
    it('status 변경 시 activityLog 에 status_changed 엔트리 기록', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue({ ...baseTask(), status: 'in_progress' });

      await service.updateTask('task-1', 'c-1', { status: 'in_progress' });

      const call = prisma.actionTask.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'task-1' });
      expect(call.data.status).toBe('in_progress');
      expect(call.data.activityLog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'status_changed',
            from: 'pending',
            to: 'in_progress',
          }),
        ]),
      );
    });

    it('priority 변경 시 priority_changed 엔트리 기록', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue({ ...baseTask(), priority: 'urgent' });

      await service.updateTask('task-1', 'c-1', { priority: 'urgent' });

      const call = prisma.actionTask.update.mock.calls[0][0];
      expect(call.data.priority).toBe('urgent');
      expect(call.data.activityLog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'priority_changed', from: 'high', to: 'urgent' }),
        ]),
      );
    });

    it('변경 없는 값이면 activityLog 엔트리 추가되지 않음', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue(baseTask());

      await service.updateTask('task-1', 'c-1', { status: 'pending', priority: 'high' });

      const call = prisma.actionTask.update.mock.calls[0][0];
      expect(call.data.activityLog).toEqual([]);
      expect(call.data.status).toBeUndefined();
      expect(call.data.priority).toBeUndefined();
    });

    it('task 존재하지 않으면 NotFoundException', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTask('missing', 'c-1', { status: 'done' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.actionTask.update).not.toHaveBeenCalled();
    });

    it('다른 company 의 task 수정 시도는 NotFoundException (IDOR guard)', async () => {
      // findFirst with { id, companyId } returns null for foreign company
      prisma.actionTask.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTask('task-1', 'foreign-company', { status: 'done' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.actionTask.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', companyId: 'foreign-company' },
      });
      expect(prisma.actionTask.update).not.toHaveBeenCalled();
    });
  });

  describe('addNote', () => {
    it('notes 배열에 { text, createdAt } 추가 + activityLog 에 note_added 기록', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue(baseTask());

      await service.addNote('task-1', 'c-1', '발주 완료');

      const call = prisma.actionTask.update.mock.calls[0][0];
      expect(call.data.notes).toEqual([
        expect.objectContaining({ text: '발주 완료' }),
      ]);
      expect(call.data.activityLog).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'note_added' })]),
      );
    });

    it('task 존재하지 않으면 NotFoundException', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(null);

      await expect(service.addNote('missing', 'c-1', 'hi')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('다른 company 의 task 에 note 추가 시도는 NotFoundException (IDOR guard)', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(null);

      await expect(
        service.addNote('task-1', 'foreign-company', 'injected note'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.actionTask.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', companyId: 'foreign-company' },
      });
      expect(prisma.actionTask.update).not.toHaveBeenCalled();
    });
  });

  describe('executeTask', () => {
    it('successful apiCall update is scoped to companyId in the write path', async () => {
      const task = {
        ...baseTask(),
        apiCall: { url: '/api/products/calculate-grades', method: 'POST', body: {} },
      };
      prisma.actionTask.findFirst.mockResolvedValue(task);
      prisma.actionTask.update.mockResolvedValue({ ...task, status: 'done' });
      prisma.actionTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionTask.findFirstOrThrow.mockResolvedValue({ ...task, status: 'done' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

      await service.executeTask('task-1', 'c-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:4000/api/products/calculate-grades',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(prisma.actionTask.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-1', companyId: 'c-1' },
        data: expect.objectContaining({
          status: 'done',
          result: { ok: true },
        }),
      });
    });

    it('failed apiCall update is scoped to companyId in the write path', async () => {
      const task = {
        ...baseTask(),
        apiCall: { url: '/api/products/calculate-grades', method: 'POST', body: {} },
      };
      prisma.actionTask.findFirst.mockResolvedValue(task);
      prisma.actionTask.update.mockResolvedValue({ ...task, status: 'done' });
      prisma.actionTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionTask.findFirstOrThrow.mockResolvedValue({ ...task, status: 'done' });
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failed'));

      await service.executeTask('task-1', 'c-1');

      expect(prisma.actionTask.updateMany).toHaveBeenCalledWith({
        where: { id: 'task-1', companyId: 'c-1' },
        data: expect.objectContaining({
          status: 'done',
          result: { error: 'network failed' },
        }),
      });
    });

    it('successful apiCall throws NotFound when scoped update is a no-op', async () => {
      const task = {
        ...baseTask(),
        apiCall: { url: '/api/products/calculate-grades', method: 'POST', body: {} },
      };
      prisma.actionTask.findFirst.mockResolvedValue(task);
      prisma.actionTask.updateMany.mockResolvedValue({ count: 0 });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

      await expect(service.executeTask('task-1', 'c-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('apiCall 없으면 NotFoundException', async () => {
      prisma.actionTask.findFirst.mockResolvedValue({ ...baseTask(), apiCall: null });

      await expect(service.executeTask('task-1', 'c-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('task 없으면 NotFoundException', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(null);

      await expect(service.executeTask('missing', 'c-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('다른 company 의 task 실행 시도는 NotFoundException (IDOR guard)', async () => {
      prisma.actionTask.findFirst.mockResolvedValue(null);

      await expect(
        service.executeTask('task-1', 'foreign-company'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.actionTask.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', companyId: 'foreign-company' },
      });
    });
  });
});

describe('ActionTaskSchema — getTasks wire format drift assertion', () => {
  it('JSON-roundtripped getTasks result parses with ActionTaskSchema', () => {
    const taskLike = {
      id: 'task-1',
      companyId: 'c-1',
      taskKey: 'h-reorder',
      type: 'human',
      label: '재고 부족',
      detail: null,
      where: null,
      href: null,
      priority: 'high',
      status: 'pending',
      role: null,
      apiCall: null,
      result: null,
      notes: [],
      activityLog: [],
      date: '2026-04-29',
      createdAt: new Date('2026-04-30T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-04-30T00:00:00.000Z').toISOString(),
      relatedProducts: [],
    };

    const wire = JSON.parse(JSON.stringify(taskLike));
    expect(ActionTaskSchema.safeParse(wire).success).toBe(true);
  });
});
