import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import AgentOsPage from './page';

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));
const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: auth.useAuth }));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/components/agent-interaction/AgentConversationSurface', () => ({
  AgentConversationSurface: ({ approvalContent }: { approvalContent?: ReactNode }) => (
    <div data-testid="agent-os-workspace">{approvalContent}</div>
  ),
}));

const INVOCATION_ID = '00000000-0000-4000-8000-000000000001';
const INVOCATION_RECEIPT = {
  id: INVOCATION_ID,
  capabilityKey: 'sourcing.inspect_candidate',
  actingAgentKey: 'sourcing',
  canonicalInput: { candidateId: 'candidate-1' },
  approvalRisk: 'low',
  approvalStatus: 'pending',
  approvalExpiresAt: '2026-08-27T00:00:00.000Z',
};

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AgentOsPage />
    </QueryClientProvider>,
  );
}

describe('AgentOsPage', () => {
  beforeEach(() => {
    navigation.searchParams = new URLSearchParams();
    auth.useAuth.mockReturnValue({
      status: 'ready',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        organizationId: '22222222-2222-4222-8222-222222222222',
      },
    });
    vi.mocked(apiClient.get).mockReset();
  });

  it('renders the existing approval card for a strict invocation UUID', async () => {
    navigation.searchParams = new URLSearchParams({ invocationId: INVOCATION_ID });
    vi.mocked(apiClient.get).mockResolvedValue(INVOCATION_RECEIPT as never);

    renderPage();

    expect(screen.getByTestId('agent-os-workspace')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '업무 실행 승인' })).toBeVisible();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(
      `/api/agent-os/invocations/${INVOCATION_ID}`,
    ));
  });

  it('does not mount or fetch an approval card when invocationId is absent', () => {
    renderPage();

    expect(screen.getByTestId('agent-os-workspace')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '업무 실행 승인' })).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it.each([
    'not-a-uuid',
    '00000000-0000-0000-0000-000000000001',
  ])('does not mount or fetch an approval card for invalid invocationId %s', (invocationId) => {
    navigation.searchParams = new URLSearchParams({ invocationId });

    renderPage();

    expect(screen.queryByRole('heading', { name: '업무 실행 승인' })).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
