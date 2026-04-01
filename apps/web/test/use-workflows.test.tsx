import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.mock('@/lib/workflow-api', () => ({
  workflowApi: {
    list: vi.fn(),
    get: vi.fn(),
    getRuns: vi.fn(),
    getRunDetail: vi.fn(),
    triggerRun: vi.fn(),
    toggleActive: vi.fn(),
    delete: vi.fn(),
  },
}));

import { workflowApi } from '@/lib/workflow-api';
import {
  useWorkflows,
  useWorkflow,
  useWorkflowRuns,
  useWorkflowRunDetail,
  useTriggerWorkflow,
  useToggleWorkflow,
  useDeleteWorkflow,
} from '@/hooks/use-workflows';

const mockWorkflowApi = vi.mocked(workflowApi);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- useQuery hooks ---

describe('useWorkflows', () => {
  it('fetches workflows list', async () => {
    const workflows = [{ id: 'w1', name: 'inventory-check' }];
    mockWorkflowApi.list.mockResolvedValueOnce(workflows as any);

    const { result } = renderHook(() => useWorkflows(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(workflows);
    expect(mockWorkflowApi.list).toHaveBeenCalledOnce();
  });
});

describe('useWorkflow', () => {
  it('fetches single workflow by id', async () => {
    const workflow = { id: 'w1', name: 'test' };
    mockWorkflowApi.get.mockResolvedValueOnce(workflow as any);

    const { result } = renderHook(() => useWorkflow('w1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(workflow);
    expect(mockWorkflowApi.get).toHaveBeenCalledWith('w1');
  });

  it('is disabled when id is empty string', () => {
    const { result } = renderHook(() => useWorkflow(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useWorkflowRuns', () => {
  it('fetches runs for workflow', async () => {
    const runs = [{ id: 'r1', status: 'completed' }];
    mockWorkflowApi.getRuns.mockResolvedValueOnce(runs as any);

    const { result } = renderHook(() => useWorkflowRuns('w1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(runs);
    expect(mockWorkflowApi.getRuns).toHaveBeenCalledWith('w1');
  });

  it('is disabled when id is empty', () => {
    const { result } = renderHook(() => useWorkflowRuns(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useWorkflowRunDetail', () => {
  it('fetches run detail by runId', async () => {
    const detail = { id: 'r1', steps: [{ nodeId: 'n1' }] };
    mockWorkflowApi.getRunDetail.mockResolvedValueOnce(detail as any);

    const { result } = renderHook(() => useWorkflowRunDetail('r1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(detail);
    expect(mockWorkflowApi.getRunDetail).toHaveBeenCalledWith('r1');
  });

  it('is disabled when runId is empty', () => {
    const { result } = renderHook(() => useWorkflowRunDetail(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// --- useMutation hooks ---

describe('useTriggerWorkflow', () => {
  it('calls workflowApi.triggerRun with id and context', async () => {
    mockWorkflowApi.triggerRun.mockResolvedValueOnce({ id: 'r1' } as any);

    const { result } = renderHook(() => useTriggerWorkflow(), { wrapper: createWrapper() });
    const context = { productId: 'p1' };
    await act(() => result.current.mutateAsync({ id: 'w1', context }));

    expect(mockWorkflowApi.triggerRun).toHaveBeenCalledWith('w1', context);
  });
});

describe('useToggleWorkflow', () => {
  it('calls workflowApi.toggleActive with id and isActive', async () => {
    mockWorkflowApi.toggleActive.mockResolvedValueOnce({ id: 'w1', isActive: false } as any);

    const { result } = renderHook(() => useToggleWorkflow(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync({ id: 'w1', isActive: false }));

    expect(mockWorkflowApi.toggleActive).toHaveBeenCalledWith('w1', false);
  });
});

describe('useDeleteWorkflow', () => {
  it('calls workflowApi.delete', async () => {
    mockWorkflowApi.delete.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteWorkflow(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync('w1'));

    expect(mockWorkflowApi.delete).toHaveBeenCalledWith('w1');
  });
});
