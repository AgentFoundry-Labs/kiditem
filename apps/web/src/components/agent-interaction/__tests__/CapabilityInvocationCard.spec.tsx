import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { CapabilityInvocationCard } from '../CapabilityInvocationCard';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

describe('CapabilityInvocationCard', () => {
  it('loads the authenticated receipt and approves only its exact Invocation', async () => {
    const invocationId = '00000000-0000-4000-8000-000000000001';
    vi.mocked(apiClient.get).mockResolvedValue({
      id: invocationId,
      capabilityKey: 'sourcing.inspect_candidate',
      actingAgentKey: 'sourcing',
      canonicalInput: { candidateId: 'candidate-1' },
      approvalStatus: 'pending',
      approvalExpiresAt: '2026-08-27T00:00:00.000Z',
      approvalRisk: 'low',
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ approvalStatus: 'approved' } as never);
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard invocationId={invocationId} /></QueryClientProvider>);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/agent-os/invocations/${invocationId}/decision`, { decision: 'approved' },
    ));
    expect(screen.getByText('Acting Agent')).toBeVisible();
    expect(screen.getByText('sourcing')).toBeVisible();
    expect(screen.getByText('low')).toBeVisible();
    expect(await screen.findByText('The provider may retry the same request.')).toBeVisible();
  });

  it('keeps a rejected receipt distinct from an approved retry acknowledgement', async () => {
    const invocationId = '00000000-0000-4000-8000-000000000002';
    vi.mocked(apiClient.get).mockResolvedValue({
      id: invocationId,
      capabilityKey: 'sourcing.inspect_candidate',
      actingAgentKey: 'sourcing',
      canonicalInput: { candidateId: 'candidate-1' },
      approvalRisk: 'low',
      approvalStatus: 'pending',
      approvalExpiresAt: null,
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ approvalStatus: 'rejected' } as never);
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard invocationId={invocationId} /></QueryClientProvider>);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('The request was rejected.')).toBeVisible();
    expect(screen.queryByText('The provider may retry the same request.')).not.toBeInTheDocument();
  });

  it.each([
    ['rejected', 'Rejected. No work was started by this decision.'],
    ['expired', 'Approval expired before a decision was recorded.'],
    ['ambiguous', 'Approval status is ambiguous. Review the Invocation receipt.'],
  ])('uses a neutral approval heading and distinct %s receipt copy', async (approvalStatus, expectedCopy) => {
    const invocationId = '00000000-0000-4000-8000-000000000003';
    vi.mocked(apiClient.get).mockResolvedValue({
      id: invocationId,
      capabilityKey: 'sourcing.inspect_candidate',
      actingAgentKey: 'sourcing',
      canonicalInput: { candidateId: 'candidate-1' },
      approvalRisk: 'low',
      approvalStatus,
      approvalExpiresAt: null,
    } as never);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CapabilityInvocationCard invocationId={invocationId} /></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'Capability approval' })).toBeVisible();
    expect(screen.getByText(expectedCopy)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
