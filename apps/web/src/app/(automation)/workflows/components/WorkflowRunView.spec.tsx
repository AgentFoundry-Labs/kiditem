import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkflowRunView from './WorkflowRunView';
import type { WorkflowTemplate, WorkflowRunWithSteps } from '../lib/workflow-types';

const mockCancelMutate = vi.hoisted(() => vi.fn());

vi.mock('./WorkflowCanvas', () => ({
  default: () => <div data-testid="workflow-canvas" />,
}));

vi.mock('./NodeDetailPopover', () => ({
  default: () => <div data-testid="node-popover" />,
}));

vi.mock('../hooks/useWorkflows', () => ({
  useCancelWorkflowRun: () => ({
    mutate: mockCancelMutate,
    isPending: false,
  }),
}));

const template: WorkflowTemplate = {
  id: 'template-1',
  organizationId: null,
  name: '테스트 워크플로',
  description: '테스트',
  module: 'automation',
  isActive: true,
  triggerType: 'manual',
  schedule: null,
  nodesJson: [],
  edgesJson: [],
  version: 1,
  marketplaceId: null,
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T00:00:00.000Z',
};

function makeRun(overrides: Partial<WorkflowRunWithSteps> = {}): WorkflowRunWithSteps {
  return {
    id: 'run-1',
    organizationId: null,
    templateId: 'template-1',
    status: 'running',
    triggeredBy: 'manual',
    contextData: null,
    error: null,
    startedAt: '2026-05-17T00:00:00.000Z',
    completedAt: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    steps: [],
    ...overrides,
  };
}

describe('WorkflowRunView', () => {
  beforeEach(() => {
    mockCancelMutate.mockClear();
  });

  it('offers a stop action while the workflow run is active', () => {
    render(<WorkflowRunView template={template} run={makeRun()} />);

    expect(screen.getByRole('button', { name: '워크플로 실행 중단' })).toBeInTheDocument();
  });

  it('cancels the current workflow run through the hook', () => {
    render(<WorkflowRunView template={template} run={makeRun()} />);

    fireEvent.click(screen.getByRole('button', { name: '워크플로 실행 중단' }));

    expect(mockCancelMutate).toHaveBeenCalledWith('run-1');
  });

  it('renders cancelled workflow runs as terminal instead of pending', () => {
    render(<WorkflowRunView template={template} run={makeRun({ status: 'cancelled' })} />);

    expect(screen.getByLabelText('상태: 취소됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '워크플로 실행 중단' })).not.toBeInTheDocument();
  });
});
