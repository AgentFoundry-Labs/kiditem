import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentOsPage from './page';

vi.mock('@/components/agent-interaction/AgentConversationSurface', () => ({
  AgentConversationSurface: () => <div data-testid="agent-os-workspace" />,
}));

describe('AgentOsPage', () => {
  it('mounts the route-stable Agent OS workspace presentation', () => {
    render(<AgentOsPage />);

    expect(screen.getByTestId('agent-os-workspace')).toBeInTheDocument();
  });
});
