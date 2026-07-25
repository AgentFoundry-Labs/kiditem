import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockSendControl = vi.hoisted(() => vi.fn());
const mockSyncAlert = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/browser-collection-session')
  >()),
  sendBrowserCollectionControl: mockSendControl,
  syncBrowserCollectionAlert: mockSyncAlert,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

import { BrowserCollectionRunControls } from './BrowserCollectionRunControls';

function session(
  overrides: Partial<BrowserCollectionSessionView> = {},
): BrowserCollectionSessionView {
  return {
    runId: RUN_ID,
    producer: 'dashboard.wing_sales',
    classification: 'background_preferred',
    status: 'running',
    attempt: 2,
    restartStrategy: 'web',
    progress: {
      current: 1,
      total: 4,
      completed: 0,
      failed: 0,
      label: 'Wing 매출 수집',
    },
    inputIdentity: { trigger: 'dashboard_traffic' },
    attention: null,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    finishedAt: null,
    ...overrides,
  };
}

function attentionSession(
  overrides: Partial<BrowserCollectionSessionView> = {},
): BrowserCollectionSessionView {
  return session({
    status: 'attention_required',
    attention: {
      reason: 'marketplace_login',
      message: 'Wing 로그인이 필요합니다.',
      canOpenTab: true,
    },
    ...overrides,
  });
}

function renderWithQueryClient(
  ui: React.ReactElement,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return {
    queryClient,
    ...render(ui, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    }),
  };
}

describe('BrowserCollectionRunControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendControl.mockResolvedValue(null);
    mockSyncAlert.mockResolvedValue(undefined);
    mockToastError.mockReset();
  });

  it('renders progress, attempt, and cancel while running', () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session()}
        onWebRestart={vi.fn()}
      />,
    );

    expect(screen.getByText('진행 1 / 4')).toBeInTheDocument();
    expect(screen.getByText('시도 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '확인 탭 열기' }),
    ).not.toBeInTheDocument();
  });

  it('can omit the built-in cancel when the owning panel places it beside status', () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session()}
        onWebRestart={vi.fn()}
        showCancel={false}
      />,
    );

    expect(screen.getByText('진행 1 / 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '중단' })).not.toBeInTheDocument();
  });

  it('renders explicit open, restart, and cancel controls for attention', () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={attentionSession()}
        onWebRestart={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '확인 탭 열기' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '처음부터 재실행' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
  });

  it('opens the attention tab only after the explicit button click', async () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={attentionSession()}
        onWebRestart={vi.fn()}
      />,
    );
    expect(mockSendControl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '확인 탭 열기' }));

    await waitFor(() => {
      expect(mockSendControl).toHaveBeenCalledWith(
        RUN_ID,
        'openCollectionAttentionTab',
      );
    });
  });

  it('does not render a focus action when the session cannot open a tab', () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={attentionSession({
          attention: {
            reason: 'marketplace_login',
            message: 'Wing 로그인이 필요합니다.',
            canOpenTab: false,
          },
        })}
        onWebRestart={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '확인 탭 열기' }),
    ).not.toBeInTheDocument();
  });

  it('restarts an extension-strategy session through the extension control', async () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={attentionSession({ restartStrategy: 'extension' })}
        onWebRestart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '처음부터 재실행' }));

    await waitFor(() => {
      expect(mockSendControl).toHaveBeenCalledWith(
        RUN_ID,
        'restartCollectionSession',
      );
    });
  });

  it('uses the parsed restart response to replace a stale attention cache entry', async () => {
    const current = attentionSession({ restartStrategy: 'extension' });
    const restarted = session({
      status: 'running',
      attempt: current.attempt + 1,
      updatedAt: current.updatedAt + 1,
    });
    mockSendControl.mockResolvedValueOnce(restarted);
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      queryKeys.browserCollection.session(RUN_ID),
      current,
    );
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={current}
        onWebRestart={vi.fn()}
      />,
      queryClient,
    );

    fireEvent.click(screen.getByRole('button', { name: '처음부터 재실행' }));

    await waitFor(() => {
      expect(
        queryClient.getQueryData(
          queryKeys.browserCollection.session(RUN_ID),
        ),
      ).toEqual(restarted);
    });
  });

  it('delegates a web-strategy restart to the required route callback', async () => {
    const current = attentionSession({ restartStrategy: 'web' });
    const onWebRestart = vi.fn().mockResolvedValue(undefined);
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={current}
        onWebRestart={onWebRestart}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '처음부터 재실행' }));

    await waitFor(() => expect(onWebRestart).toHaveBeenCalledWith(current));
    expect(mockSendControl).not.toHaveBeenCalledWith(
      RUN_ID,
      'restartCollectionSession',
    );
  });

  it('keeps cancel actionable during a pending web restart and blocks duplicate restarts', async () => {
    const current = attentionSession({ restartStrategy: 'web' });
    let resolveRestart: (() => void) | undefined;
    const onWebRestart = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRestart = resolve;
        }),
    );
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={current}
        onWebRestart={onWebRestart}
      />,
    );

    const restartButton = screen.getByRole('button', {
      name: '처음부터 재실행',
    });
    fireEvent.click(restartButton);
    fireEvent.click(restartButton);

    await waitFor(() => expect(onWebRestart).toHaveBeenCalledTimes(1));
    expect(restartButton).toBeDisabled();

    const cancelButton = screen.getByRole('button', { name: '중단' });
    expect(cancelButton).toBeEnabled();
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockSendControl).toHaveBeenCalledWith(
        RUN_ID,
        'cancelCollectionSession',
      );
    });
    expect(onWebRestart).toHaveBeenCalledTimes(1);

    resolveRestart?.();
    await waitFor(() => expect(restartButton).toBeEnabled());
  });

  it('explains when this route cannot safely restart a web-strategy session', () => {
    const onWebRestart = vi.fn();
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={attentionSession({ restartStrategy: 'web' })}
        onWebRestart={onWebRestart}
        webRestartUnavailableMessage="이 작업은 원래 실행 화면에서 재실행해주세요."
      />,
    );

    expect(
      screen.getByText('이 작업은 원래 실행 화면에서 재실행해주세요.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '처음부터 재실행' }),
    ).not.toBeInTheDocument();
    expect(onWebRestart).not.toHaveBeenCalled();
  });

  it('sends cancellation from both running and attention states', async () => {
    const { rerender, queryClient } = renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session()}
        onWebRestart={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '중단' }));
    await waitFor(() => {
      expect(mockSendControl).toHaveBeenCalledWith(
        RUN_ID,
        'cancelCollectionSession',
      );
    });
    const cancelled = session({
      status: 'cancelled',
      updatedAt: session().updatedAt + 1,
      finishedAt: session().updatedAt + 1,
    });
    mockSendControl.mockResolvedValueOnce(cancelled);

    mockSendControl.mockClear();
    rerender(
      <BrowserCollectionRunControls
        session={attentionSession()}
        onWebRestart={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '중단' }));
    await waitFor(() => {
      expect(mockSendControl).toHaveBeenCalledWith(
        RUN_ID,
        'cancelCollectionSession',
      );
    });
    expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(RUN_ID)),
    ).toEqual(cancelled);
    expect(mockSyncAlert).toHaveBeenCalledWith(cancelled);
  });

  it('renders no controls after a session reaches a terminal state', () => {
    const { container } = renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session({
          status: 'succeeded',
          finishedAt: 1_700_000_002_000,
        })}
        onWebRestart={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a visible error when cancellation is not confirmed', async () => {
    mockSendControl.mockRejectedValueOnce(
      new Error('브라우저 수집 중단 상태를 확인하지 못했습니다.'),
    );
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={attentionSession()}
        onWebRestart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        '브라우저 수집 중단 상태를 확인하지 못했습니다.',
      );
    });
  });
});
