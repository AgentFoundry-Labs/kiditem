import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// next/navigation mock
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// agent-api mock
vi.mock('../../lib/agent-api', () => ({
  fetchAgentTasksList: vi.fn(),
}));

import { fetchAgentTasksList } from '../../lib/agent-api';
import AgentTasksPage from '../page';

const mockFetch = fetchAgentTasksList as ReturnType<typeof vi.fn>;

function wrap(node: JSX.Element) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseTask = {
  id: 'task-0000-aaaa-bbbb-cccc',
  companyId: 'c1',
  agentType: 'ad-strategy',
  status: 'succeeded',
  priority: 0,
  workflowRunId: null,
  workflowNodeId: null,
  sourceDataId: null,
  input: null,
  output: null,
  error: null,
  scheduledAt: null,
  startedAt: '2026-04-13T10:00:00Z',
  completedAt: '2026-04-13T10:01:00Z',
  createdAt: '2026-04-13T10:00:00Z',
  updatedAt: '2026-04-13T10:01:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ items: [baseTask], total: 1, page: 1, limit: 20 });
});

describe('AgentTasksPage', () => {
  it('태스크 목록 렌더', async () => {
    render(wrap(<AgentTasksPage />));
    await waitFor(() => {
      expect(screen.getByText('ad-strategy')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('빈 결과 → empty state', async () => {
    mockFetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    render(wrap(<AgentTasksPage />));
    await waitFor(() => {
      expect(screen.getByText('조건에 맞는 태스크가 없습니다.')).toBeInTheDocument();
    });
  });

  it('행 클릭 → router.push(trace)', async () => {
    render(wrap(<AgentTasksPage />));
    await waitFor(() => expect(screen.getByText('ad-strategy')).toBeInTheDocument());

    fireEvent.click(screen.getByText('ad-strategy'));
    expect(mockPush).toHaveBeenCalledWith(`/agents/tasks/${baseTask.id}/trace`);
  });

  it('status 필터 변경 시 재요청', async () => {
    render(wrap(<AgentTasksPage />));
    // 로딩 완료 → select 노출
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'failed' } });

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toMatchObject({ status: 'failed' });
    });
  });

  it('agentType debounce — 300ms 뒤 호출', async () => {
    render(wrap(<AgentTasksPage />));
    const input = await screen.findByPlaceholderText('예: ad-strategy');
    fireEvent.change(input, { target: { value: 'foo' } });

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toMatchObject({ agentType: 'foo' });
    }, { timeout: 2000 });
  });
});
