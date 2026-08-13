import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  InteractionResultRenderer,
  SuggestedReplies,
} from '../renderers';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));

describe('interaction renderers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses text fallback for an unknown kind without dynamic component authority', () => {
    renderWithQuery(<InteractionResultRenderer result={{
      kind: 'AdminPanel',
      component: 'DeleteEverything',
      textFallback: '지원하지 않는 응답입니다.',
    }} />);
    expect(screen.getByText('지원하지 않는 응답입니다.')).toBeVisible();
    expect(screen.queryByText('DeleteEverything')).not.toBeInTheDocument();
  });

  it('shows only latest-message suggestions and consumes siblings after one send', () => {
    const send = vi.fn();
    const replies = Array.from({ length: 3 }, (_, index) => ({
      id: `reply-${index}`,
      label: `추천 ${index}`,
      content: `질문 ${index}`,
    }));
    const { rerender } = render(
      <SuggestedReplies replies={replies} isLatestMessage={false} onSend={send} />,
    );
    expect(screen.queryByRole('button', { name: '추천 0' })).not.toBeInTheDocument();
    rerender(<SuggestedReplies replies={replies} isLatestMessage onSend={send} />);
    fireEvent.click(screen.getByRole('button', { name: '추천 0' }));
    expect(send).toHaveBeenCalledWith('질문 0');
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '추천 1' })).not.toBeInTheDocument();
  });

  it('authorizes navigation with actionId only before pushing the allowlisted href', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ href: '/stock-ops' });
    renderWithQuery(<InteractionResultRenderer result={{
      kind: 'navigation',
      actionId: '11111111-1111-4111-8111-111111111111',
      routeKey: 'inventory_stock_ops',
      resourceRef: null,
      label: '재고 작업',
      disabledReason: null,
      expiresAt: '2099-08-13T00:00:00.000Z',
      textFallback: '재고 작업으로 이동합니다.',
    }} />);
    fireEvent.click(screen.getByRole('button', { name: '재고 작업' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/stock-ops'));
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/agent-os/interaction/actions/authorize',
      { actionId: '11111111-1111-4111-8111-111111111111' },
    );
  });

  it('keeps inaccessible navigation disabled with its visible reason', () => {
    renderWithQuery(<InteractionResultRenderer result={{
      kind: 'navigation',
      actionId: '11111111-1111-4111-8111-111111111111',
      routeKey: 'agent_os',
      resourceRef: null,
      label: 'AgentOS',
      disabledReason: '접근 권한이 없습니다.',
      expiresAt: '2099-08-13T00:00:00.000Z',
      textFallback: 'AgentOS로 이동할 수 없습니다.',
    }} />);
    expect(screen.getByRole('button', { name: 'AgentOS' })).toBeDisabled();
    expect(screen.getByText('접근 권한이 없습니다.')).toBeVisible();
  });
});

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
