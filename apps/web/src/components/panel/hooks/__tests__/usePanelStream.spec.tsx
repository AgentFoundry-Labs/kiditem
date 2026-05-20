import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { usePanelStore } from '../../lib/panel-store';
import { usePanelStream } from '../usePanelStream';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock('../../lib/panel-sse-client', () => ({
  PanelSseClient: vi.fn().mockImplementation(function MockPanelSseClient(this: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }) {
    this.connect = vi.fn();
    this.disconnect = vi.fn();
  }),
}));

const panelItem = {
  id: 'alert-1',
  kind: 'alert',
  alertKind: 'operation',
  status: 'running',
  type: 'detail_page_generation',
  severity: 'info',
  title: '상세페이지 생성',
  message: null,
  sourceType: 'content_generation',
  sourceId: 'generation-1',
  operationKey: 'detail-page:generation-1',
  targetType: 'content_workspace',
  targetId: 'workspace-1',
  actorUserId: 'user-1',
  visibility: 'user',
  href: '/product-pipeline/detail-pages/generation-1/editor',
  progress: null,
  isRead: false,
  readAt: null,
  actionTaskId: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  startedAt: '2026-05-20T00:00:00.000Z',
  finishedAt: null,
} as const;

describe('usePanelStream fallback polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePanelStore.setState({
      byId: {},
      lastSeq: 0,
      isOpen: false,
      connectionStatus: 'disconnected',
    });
  });

  it('loads a panel snapshot when the SSE connection is disconnected', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([panelItem]);

    renderHook(() => usePanelStream());

    act(() => {
      usePanelStore.getState().setConnectionStatus('disconnected');
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/panel/snapshot');
      expect(usePanelStore.getState().byId['alert-1']).toEqual(panelItem);
      expect(usePanelStore.getState().connectionStatus).toBe('polling_fallback');
    });
  });
});
