import { describe, it, expect } from 'vitest';
import { workflowPanelAdapter, WorkflowRunInput } from '../workflow.adapter';

const input: WorkflowRunInput = {
  id: 'run-uuid',
  status: 'running',
  templateName: '소싱 파이프라인',
  steps: [{ id: 's1', status: 'succeeded' }, { id: 's2', status: 'running' }, { id: 's3', status: 'pending' }],
  parentRunId: null,
  triggeredByUserId: 'user-uuid',
  createdAt: new Date('2026-04-15T00:00:00Z'),
};

describe('workflowPanelAdapter', () => {
  it('maps to PanelRunItem with derived progress', () => {
    const item = workflowPanelAdapter.mapToItem(input, 'co-1');
    expect(item).toMatchObject({
      id: 'workflow:run-uuid',
      kind: 'run',
      source: 'workflow',
      sourceId: 'run-uuid',
      status: 'running',
      title: '소싱 파이프라인',
      subtitle: '1/3 단계',
      progress: 1 / 3,
      deepLink: '/workflows/runs/run-uuid',
      actorUserId: 'user-uuid',
      visibility: 'user',
    });
  });

  it('visibility=company when triggeredByUserId=null (scheduled)', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, triggeredByUserId: null },
      'co-1',
    );
    expect(item.visibility).toBe('company');
    expect(item.actorUserId).toBeNull();
  });

  it('progress undefined when no steps', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, steps: [] },
      'co-1',
    );
    expect(item.progress).toBeUndefined();
    expect(item.subtitle).toBe('0/0 단계');
  });

  it('parentId set from parentRunId', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, parentRunId: 'parent-uuid' },
      'co-1',
    );
    expect(item.parentId).toBe('workflow:parent-uuid');
  });

  it('falls back to "워크플로우" if templateName missing', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, templateName: undefined as any },
      'co-1',
    );
    expect(item.title).toBe('워크플로우');
  });

  it('coerces unknown status to pending', () => {
    const item = workflowPanelAdapter.mapToItem(
      { ...input, status: 'timeout' },
      'co-1',
    );
    expect(item.status).toBe('pending');
  });
});
