import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentOsPage from './page';

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
}));

vi.mock('@/components/agent-interaction/AgentConversationSurface', () => ({
  AgentConversationSurface: ({
    fallbackApprovalInvocationId,
  }: {
    fallbackApprovalInvocationId?: string | null;
  }) => (
    <div data-testid="agent-os-workspace">{fallbackApprovalInvocationId ?? ''}</div>
  ),
}));

const INVOCATION_ID = '00000000-0000-4000-8000-000000000001';

function renderPage() {
  return render(<AgentOsPage />);
}

describe('AgentOsPage', () => {
  beforeEach(() => {
    navigation.searchParams = new URLSearchParams();
  });

  it('passes a strict invocation UUID to the Agent OS fallback seam', () => {
    navigation.searchParams = new URLSearchParams({ invocationId: INVOCATION_ID });

    renderPage();

    expect(screen.getByTestId('agent-os-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('agent-os-workspace')).toHaveTextContent(INVOCATION_ID);
  });

  it('does not pass an approval fallback when invocationId is absent', () => {
    renderPage();

    expect(screen.getByTestId('agent-os-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('agent-os-workspace')).toBeEmptyDOMElement();
  });

  it.each([
    'not-a-uuid',
    '00000000-0000-0000-0000-000000000001',
  ])('does not pass an approval fallback for invalid invocationId %s', (invocationId) => {
    navigation.searchParams = new URLSearchParams({ invocationId });

    renderPage();

    expect(screen.getByTestId('agent-os-workspace')).toBeEmptyDOMElement();
  });
});
