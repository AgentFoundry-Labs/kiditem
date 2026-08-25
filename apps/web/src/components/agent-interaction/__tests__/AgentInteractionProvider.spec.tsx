import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentInteractionProvider } from '../AgentInteractionProvider';

const { captureCopilotKitProps } = vi.hoisted(() => ({
  captureCopilotKitProps: vi.fn(),
}));

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: (props: { children: ReactNode } & Record<string, unknown>) => {
    captureCopilotKitProps(props);
    return props.children;
  },
}));

describe('AgentInteractionProvider transport contract', () => {
  it('selects the multi-route CopilotKit v2 transport exposed by Nest', () => {
    render(
      <AgentInteractionProvider>
        <span>Agent work</span>
      </AgentInteractionProvider>,
    );

    expect(screen.getByText('Agent work')).toBeVisible();
    expect(captureCopilotKitProps).toHaveBeenCalledWith(expect.objectContaining({
      runtimeUrl: '/api/copilotkit',
      credentials: 'include',
      useSingleEndpoint: false,
    }));
  });
});
