import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PromoteToTaskModal } from '../PromoteToTaskModal';
import type { PanelAlertItem } from '@kiditem/shared/panel';

// Mock apiClient
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-error';

const makeAlert = (overrides: Partial<PanelAlertItem> = {}): PanelAlertItem => ({
  kind: 'alert',
  id: '00000000-0000-0000-0000-000000000001',
  alertKind: 'signal',
  status: 'open',
  severity: 'critical',
  type: 'internal:rules',
  title: '긴급 규칙 위반',
  message: '상세 메시지',
  targetType: null,
  targetId: null,
  operationKey: null,
  sourceType: null,
  sourceId: null,
  isRead: false,
  actionTaskId: null,
  actorUserId: null,
  href: null,
  progress: null,
  metadata: {},
  readAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-04-15T00:00:00Z',
  ...overrides,
});

function renderModal(props: {
  alert?: PanelAlertItem;
  open?: boolean;
  onClose?: () => void;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const alert = props.alert ?? makeAlert();
  const open = props.open ?? true;
  const onClose = props.onClose ?? vi.fn();

  const result = render(
    <QueryClientProvider client={qc}>
      <PromoteToTaskModal alert={alert} open={open} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...result, qc, onClose };
}

describe('PromoteToTaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with priority defaulted from severity (critical → urgent)', () => {
    renderModal({ alert: makeAlert({ severity: 'critical' }) });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('urgent');
  });

  it('renders with priority defaulted from severity (error → high)', () => {
    renderModal({ alert: makeAlert({ severity: 'error' }) });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('high');
  });

  it('renders with priority defaulted from severity (warning → medium)', () => {
    renderModal({ alert: makeAlert({ severity: 'warning' }) });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('medium');
  });

  it('submit calls mutation with empty DTO when priority unchanged', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ task: {}, updatedAlert: {} });

    const { onClose } = renderModal({ alert: makeAlert({ severity: 'critical' }) });

    const submitBtn = screen.getByRole('button', { name: '할 일 목록에 추가' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/alerts/00000000-0000-0000-0000-000000000001/promote',
        {}, // priority unchanged → no override in DTO
      );
    });
    expect(toast.success).toHaveBeenCalledWith('할 일 목록에 추가했습니다');
    expect(onClose).toHaveBeenCalled();
  });

  it('submit includes priorityOverride when priority is changed', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ task: {}, updatedAlert: {} });

    renderModal({ alert: makeAlert({ severity: 'critical' }) }); // default: urgent

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'medium' } });

    const submitBtn = screen.getByRole('button', { name: '할 일 목록에 추가' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/alerts/00000000-0000-0000-0000-000000000001/promote',
        expect.objectContaining({ priorityOverride: 'medium' }),
      );
    });
  });

  it('submit includes roleOverride and note when filled', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ task: {}, updatedAlert: {} });

    renderModal({ alert: makeAlert({ severity: 'critical' }) });

    const roleInput = screen.getByPlaceholderText('예: ad, inventory, finance');
    fireEvent.change(roleInput, { target: { value: 'inventory' } });

    const noteInput = screen.getByPlaceholderText('추가 메모를 입력하세요');
    fireEvent.change(noteInput, { target: { value: '재고 확인 필요' } });

    fireEvent.click(screen.getByRole('button', { name: '할 일 목록에 추가' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/alerts/00000000-0000-0000-0000-000000000001/promote',
        expect.objectContaining({ roleOverride: 'inventory', note: '재고 확인 필요' }),
      );
    });
  });

  it('409 error shows "이미 ..." toast and closes', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError(409, 'CONFLICT', 'Already promoted'));

    const { onClose } = renderModal({});

    fireEvent.click(screen.getByRole('button', { name: '할 일 목록에 추가' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('이미 할 일로 등록된 알림입니다');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('non-409 error shows generic toast and closes', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError(500, 'SERVER_ERROR', 'Internal error'));

    const { onClose } = renderModal({});

    fireEvent.click(screen.getByRole('button', { name: '할 일 목록에 추가' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('할 일 추가 실패');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('close button calls onClose', () => {
    const { onClose } = renderModal({});
    const closeBtn = screen.getByLabelText('닫기');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('cancel button calls onClose', () => {
    const { onClose } = renderModal({});
    const cancelBtn = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render content when open=false', () => {
    renderModal({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
