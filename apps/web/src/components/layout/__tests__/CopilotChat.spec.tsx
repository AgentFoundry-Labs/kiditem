import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CopilotChat from '../CopilotChat';

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:4100',
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

vi.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({
    runtimeUrl,
    credentials,
    children,
  }: {
    runtimeUrl: string;
    credentials?: RequestCredentials;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="copilot-runtime"
      data-runtime-url={runtimeUrl}
      data-credentials={credentials}
    >
      {children}
    </div>
  ),
}));

vi.mock('@copilotkit/react-ui', () => ({
  CopilotSidebar: () => <div data-testid="copilot-sidebar" />,
}));

describe('CopilotChat', () => {
  it('uses the configured API base for the Copilot runtime URL', () => {
    render(<CopilotChat />);

    expect(screen.getByTestId('copilot-runtime')).toHaveAttribute(
      'data-runtime-url',
      'http://localhost:4100/api/chat/copilot',
    );
    expect(screen.getByTestId('copilot-runtime')).toHaveAttribute(
      'data-credentials',
      'include',
    );
  });
});
