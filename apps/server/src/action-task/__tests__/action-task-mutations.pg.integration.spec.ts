import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

import { ActionTaskService } from '../action-task.service';
import {
  makeTestPrisma,
  OTHER_COMPANY_ID,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';

async function seedTask(
  prisma: PrismaClient,
  overrides: Partial<Prisma.ActionTaskUncheckedCreateInput> = {},
) {
  return prisma.actionTask.create({
    data: {
      companyId: TEST_COMPANY_ID,
      taskKey: `mutation-idor-${crypto.randomUUID()}`,
      type: 'ai',
      label: 'Mutation IDOR guard',
      priority: 'medium',
      status: 'pending',
      date: new Date('2026-04-25T00:00:00.000Z'),
      notes: [],
      activityLog: [],
      assigneeUserId: null,
      ...overrides,
    },
  });
}

describe('ActionTask mutations — real Postgres tenant guard', () => {
  let prisma: PrismaClient;
  let service: ActionTaskService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    service = new ActionTaskService(prisma as any);
  });

  it('updateTask rejects a foreign-company id and leaves the row unchanged', async () => {
    const task = await seedTask(prisma);

    await expect(
      service.updateTask(task.id, OTHER_COMPANY_ID, { status: 'done', priority: 'urgent' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const db = await prisma.actionTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(db.companyId).toBe(TEST_COMPANY_ID);
    expect(db.status).toBe('pending');
    expect(db.priority).toBe('medium');
    expect(db.activityLog).toEqual([]);
  });

  it('addNote rejects a foreign-company id and leaves notes/activityLog unchanged', async () => {
    const task = await seedTask(prisma);

    await expect(
      service.addNote(task.id, OTHER_COMPANY_ID, 'foreign tenant note'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const db = await prisma.actionTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(db.companyId).toBe(TEST_COMPANY_ID);
    expect(db.notes).toEqual([]);
    expect(db.activityLog).toEqual([]);
  });

  it('executeTask rejects a foreign-company id before calling apiCall or mutating the task', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
    const task = await seedTask(prisma, {
      apiCall: { url: '/api/__test-should-not-run', method: 'GET' },
    });

    await expect(
      service.executeTask(task.id, OTHER_COMPANY_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(fetchSpy).not.toHaveBeenCalled();
    const db = await prisma.actionTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(db.companyId).toBe(TEST_COMPANY_ID);
    expect(db.status).toBe('pending');
    expect(db.result).toBeNull();
    expect(db.activityLog).toEqual([]);
  });
});
