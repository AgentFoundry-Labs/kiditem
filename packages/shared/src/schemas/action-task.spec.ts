import { describe, expect, it } from 'vitest';
import {
  ActionTaskListSchema,
  ActionTaskSchema,
} from './action-task.js';

const baseTask = {
  id: 'task-1',
  organizationId: 'organization-1',
  taskKey: 'inventory.low',
  type: 'reorder',
  label: '재발주 필요',
  detail: '안전재고 미달',
  where: '/inventory',
  href: '/inventory?status=low',
  priority: 'high',
  status: 'pending',
  role: 'inventory',
  apiCall: { method: 'POST', path: '/api/inventory/123/receive' },
  result: null,
  notes: [],
  activityLog: [],
  date: '2026-04-25',
  relatedProducts: [
    { id: 'p-1', name: '키즈 티셔츠', metric: 'currentStock', value: '2' },
  ],
  assigneeUserId: null,
  assigneeUser: null,
  sourceAlert: null,
  createdAt: '2026-04-25T00:00:00.000Z',
  updatedAt: '2026-04-25T00:00:00.000Z',
};

describe('action-task shared schemas', () => {
  it('parses a full ActionTaskSchema with relatedProducts', () => {
    expect(() => ActionTaskSchema.parse(baseTask)).not.toThrow();
  });

  it('parses ActionTaskListSchema for an array of tasks', () => {
    const result = ActionTaskListSchema.parse([baseTask, { ...baseTask, id: 'task-2' }]);
    expect(result).toHaveLength(2);
    expect(result[1]?.id).toBe('task-2');
  });

  it('parses ActionTaskSchema as the execute response shape', () => {
    const updated = {
      ...baseTask,
      status: 'done',
      result: { ok: true, executedAt: '2026-04-25T01:00:00.000Z' },
      activityLog: [
        {
          action: 'execute',
          timestamp: '2026-04-25T01:00:00.000Z',
          success: true,
        },
      ],
    };
    expect(() => ActionTaskSchema.parse(updated)).not.toThrow();
  });

  it('parses sourceAlert: null', () => {
    expect(() =>
      ActionTaskSchema.parse({
        ...baseTask,
        sourceAlert: null,
      }),
    ).not.toThrow();
  });

  it('parses sourceAlert with full object', () => {
    expect(() =>
      ActionTaskSchema.parse({
        ...baseTask,
        sourceAlert: {
          id: 'alert-1',
          title: '재고 부족',
          severity: 'high',
          message: '안전재고 미달',
        },
      }),
    ).not.toThrow();
  });

  it('rejects a task missing label', () => {
    const { label: _label, ...withoutLabel } = baseTask;
    expect(ActionTaskSchema.safeParse(withoutLabel).success).toBe(false);
  });
});
