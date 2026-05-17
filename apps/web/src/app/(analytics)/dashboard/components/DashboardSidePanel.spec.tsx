import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardSidePanel } from './DashboardSidePanel';

const mockApiPatch = vi.hoisted(() => vi.fn(async () => ({})));
const mockCancelOperation = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    status: 'cancelled',
    message: '중단 요청이 반영되었습니다.',
    operationKey: 'operation-key-1',
    affected: {
      workflowRunIds: [],
      agentRunRequestIds: [],
      agentRunIds: [],
      contentGenerationIds: [],
      thumbnailGenerationIds: [],
    },
    preserved: {
      contentGenerationIds: [],
      thumbnailGenerationIds: [],
    },
    warnings: [],
  })),
);
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: mockApiPatch,
  },
}));

vi.mock('@/lib/operation-cancellation', () => ({
  cancelOperation: mockCancelOperation,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const makeAlert = (
  overrides: Partial<DashboardAlertItem> & { operationKey?: string | null } = {},
) =>
  ({
    id: 'alert-1',
    kind: 'operation',
    status: 'running',
    type: 'thumbnail_generation',
    severity: 'info',
    title: '썸네일 자동 생성',
    message: '진행 중',
    sourceType: 'thumbnail_generation',
    href: '/product-pipeline/thumbnail-generation',
    progress: 0.5,
    targetType: null,
    targetId: null,
    isRead: false,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    operationKey: 'operation-key-1',
    ...overrides,
  }) as DashboardAlertItem & { operationKey?: string | null };

describe('DashboardSidePanel', () => {
  beforeEach(() => {
    mockApiPatch.mockClear();
    mockCancelOperation.mockClear();
    mockToastError.mockClear();
  });

  it('offers a stop action for running operation alerts with an operation key', () => {
    render(<DashboardSidePanel alerts={[makeAlert()]} queryClient={makeQueryClient()} />);

    expect(screen.getByRole('button', { name: '작업 중단' })).toBeInTheDocument();
  });

  it('cancels the operation through the common cancellation API', async () => {
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(<DashboardSidePanel alerts={[makeAlert()]} queryClient={queryClient} />);

    fireEvent.click(screen.getByRole('button', { name: '작업 중단' }));
    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(mockCancelOperation).toHaveBeenCalledWith({
        targetType: 'operation_key',
        operationKey: 'operation-key-1',
        reason: '사용자 요청',
      });
    });
    expect(invalidate).toHaveBeenCalled();
  });
});
