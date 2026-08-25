import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationProvider } from '../ConversationProvider';

const captureProps = vi.hoisted(() => vi.fn());
const getAuthSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKit: (props: { children: ReactNode } & Record<string, unknown>) => {
    captureProps(props);
    return props.children;
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getAuthSession: getAuthSessionMock,
}));

describe('ConversationProvider', () => {
  beforeEach(() => {
    captureProps.mockReset();
    getAuthSessionMock.mockReset();
  });

  it('uses the authenticated public single-route CopilotKit transport', () => {
    getAuthSessionMock.mockReturnValue(null);
    render(<ConversationProvider><span>Conversation</span></ConversationProvider>);
    expect(screen.getByText('Conversation')).toBeVisible();
    expect(captureProps).toHaveBeenCalledWith(expect.objectContaining({
      runtimeUrl: '/api/copilotkit', credentials: 'include', useSingleEndpoint: true,
    }));
  });

  it('uses a dynamic ordinary KidItem Authorization header without exposing the token elsewhere', () => {
    const token = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    getAuthSessionMock.mockReturnValue({ token, expiresAt: '2026-09-01T00:00:00.000Z' });
    render(<ConversationProvider><span>Conversation</span></ConversationProvider>);

    const props = captureProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props.headers).toEqual(expect.any(Function));
    const headers = (props.headers as () => Record<string, string>)();
    expect(headers).toEqual({ Authorization: `Bearer ${token}` });
    expect(JSON.stringify({ ...props, headers: undefined })).not.toContain(token);

    getAuthSessionMock.mockReturnValue(null);
    expect((props.headers as () => Record<string, string>)()).toEqual({});
  });
});
