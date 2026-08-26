import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationProvider } from '../ConversationProvider';

const captureProps = vi.hoisted(() => vi.fn());
vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: (props: { children: ReactNode } & Record<string, unknown>) => {
    captureProps(props);
    return props.children;
  },
}));

describe('ConversationProvider', () => {
  beforeEach(() => {
    captureProps.mockReset();
  });

  it('uses the authenticated public single-route CopilotKit transport', () => {
    render(<ConversationProvider><span>Conversation</span></ConversationProvider>);
    expect(screen.getByText('Conversation')).toBeVisible();
    expect(captureProps).toHaveBeenCalledWith(expect.objectContaining({
      runtimeUrl: '/api/copilotkit', credentials: 'include', useSingleEndpoint: true,
    }));
  });

  it('relies only on the same-origin HttpOnly cookie and never supplies a bearer header', () => {
    render(<ConversationProvider><span>Conversation</span></ConversationProvider>);

    const props = captureProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props).not.toHaveProperty('headers');
    expect(props).not.toHaveProperty('agentId');
    expect(props).not.toHaveProperty('threadId');
    expect(props.credentials).toBe('include');
  });
});
