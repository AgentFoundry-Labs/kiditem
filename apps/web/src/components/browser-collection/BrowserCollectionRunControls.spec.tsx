import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ATTEMPT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockSendControl = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/browser-collection-session')
  >()),
  sendBrowserCollectionControl: mockSendControl,
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
    attemptId: ATTEMPT_ID,
    producer: 'dashboard.wing_sales',
    progress: {
      current: 1,
      total: 4,
      completed: 0,
      failed: 0,
      label: 'Wing 매출 수집',
    },
    attention: null,
    ...overrides,
  };
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
    mockToastError.mockReset();
  });

  it('renders strict owner progress and cancellation while locally active', () => {
    renderWithQueryClient(<BrowserCollectionRunControls session={session()} />);

    expect(screen.getByText('진행 1 / 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
    expect(screen.queryByText('시도')).not.toBeInTheDocument();
  });

  it('can omit cancellation when the owning panel places it beside status', () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls session={session()} showCancel={false} />,
    );

    expect(screen.getByText('진행 1 / 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '중단' })).not.toBeInTheDocument();
  });

  it('renders attention-tab recovery and cancellation from the strict attention field', () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session({
          attention: {
            reason: 'marketplace_login',
            message: 'Wing 로그인이 필요합니다.',
            canOpenTab: true,
          },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: '확인 탭 열기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
    expect(screen.getByText('Wing 로그인이 필요합니다.')).toBeInTheDocument();
  });

  it('opens the attention tab only after the explicit button click', async () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session({
          attention: {
            reason: 'marketplace_login',
            message: 'Wing 로그인이 필요합니다.',
            canOpenTab: true,
          },
        })}
      />,
    );
    expect(mockSendControl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '확인 탭 열기' }));

    await waitFor(() => {
      expect(mockSendControl).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'openCollectionAttentionTab',
      );
    });
  });

  it('does not render an attention-tab action when the owner cannot open one', () => {
    renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session({
          attention: {
            reason: 'marketplace_login',
            message: 'Wing 로그인이 필요합니다.',
            canOpenTab: false,
          },
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: '확인 탭 열기' })).not.toBeInTheDocument();
  });

  it('sends cancellation with the owner attempt identity', async () => {
    renderWithQueryClient(<BrowserCollectionRunControls session={session()} />);
    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(mockSendControl).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'cancelCollectionSession',
      );
    });
  });

  it('does not show controls after the owner progress is locally complete', () => {
    const { container } = renderWithQueryClient(
      <BrowserCollectionRunControls
        session={session({
          progress: {
            current: 4,
            total: 4,
            completed: 4,
            failed: 0,
            label: 'Wing 매출 수집 완료',
          },
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a visible error when cancellation is rejected', async () => {
    mockSendControl.mockRejectedValueOnce(
      new Error('브라우저 수집 중단 상태를 확인하지 못했습니다.'),
    );
    renderWithQueryClient(<BrowserCollectionRunControls session={session()} />);

    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        '브라우저 수집 중단 상태를 확인하지 못했습니다.',
      );
    });
  });
});
