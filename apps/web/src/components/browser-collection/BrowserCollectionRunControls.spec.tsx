import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockSendControl = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', () => ({
  sendBrowserCollectionControl: mockSendControl,
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

describe('BrowserCollectionRunControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendControl.mockResolvedValue(null);
  });

  it('renders progress, attempt, and cancel while running', () => {
    render(
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

  it('renders explicit open, restart, and cancel controls for attention', () => {
    render(
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
    render(
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
    render(
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
    render(
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

  it('delegates a web-strategy restart to the required route callback', async () => {
    const current = attentionSession({ restartStrategy: 'web' });
    const onWebRestart = vi.fn().mockResolvedValue(undefined);
    render(
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

  it('sends cancellation from both running and attention states', async () => {
    const { rerender } = render(
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
  });

  it('renders no controls after a session reaches a terminal state', () => {
    const { container } = render(
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
});
