import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionTaskService } from '../action-task.service';
import { NotFoundException } from '@nestjs/common';

function makePrisma() {
  return {
    actionTask: {
      findUnique: vi.fn(),
      update: vi.fn(),
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
    prisma = makePrisma();
    service = new ActionTaskService(prisma as any);
  });

  describe('updateTask', () => {
    it('status 변경 시 activityLog 에 status_changed 엔트리 기록', async () => {
      prisma.actionTask.findUnique.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue({ ...baseTask(),status: 'in_progress' });

      await service.updateTask('task-1', { status: 'in_progress' });

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
      prisma.actionTask.findUnique.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue({ ...baseTask(),priority: 'urgent' });

      await service.updateTask('task-1', { priority: 'urgent' });

      const call = prisma.actionTask.update.mock.calls[0][0];
      expect(call.data.priority).toBe('urgent');
      expect(call.data.activityLog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'priority_changed', from: 'high', to: 'urgent' }),
        ]),
      );
    });

    it('변경 없는 값이면 activityLog 엔트리 추가되지 않음', async () => {
      prisma.actionTask.findUnique.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue(baseTask());

      await service.updateTask('task-1', { status: 'pending', priority: 'high' });

      const call = prisma.actionTask.update.mock.calls[0][0];
      expect(call.data.activityLog).toEqual([]);
      expect(call.data.status).toBeUndefined();
      expect(call.data.priority).toBeUndefined();
    });

    it('task 존재하지 않으면 NotFoundException', async () => {
      prisma.actionTask.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTask('missing', { status: 'done' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.actionTask.update).not.toHaveBeenCalled();
    });
  });

  describe('addNote', () => {
    it('notes 배열에 { text, createdAt } 추가 + activityLog 에 note_added 기록', async () => {
      prisma.actionTask.findUnique.mockResolvedValue(baseTask());
      prisma.actionTask.update.mockResolvedValue(baseTask());

      await service.addNote('task-1', '발주 완료');

      const call = prisma.actionTask.update.mock.calls[0][0];
      expect(call.data.notes).toEqual([
        expect.objectContaining({ text: '발주 완료' }),
      ]);
      expect(call.data.activityLog).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: 'note_added' })]),
      );
    });

    it('task 존재하지 않으면 NotFoundException', async () => {
      prisma.actionTask.findUnique.mockResolvedValue(null);

      await expect(service.addNote('missing', 'hi')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('executeTask', () => {
    it('apiCall 없으면 NotFoundException', async () => {
      prisma.actionTask.findUnique.mockResolvedValue({ ...baseTask(),apiCall: null });

      await expect(service.executeTask('task-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('task 없으면 NotFoundException', async () => {
      prisma.actionTask.findUnique.mockResolvedValue(null);

      await expect(service.executeTask('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
