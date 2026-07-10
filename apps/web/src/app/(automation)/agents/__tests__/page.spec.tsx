import { describe, expect, it, vi } from 'vitest';
import AgentsRedirectPage from '../page';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('legacy /agents route', () => {
  it('redirects to the canonical Agent OS HQ route', () => {
    AgentsRedirectPage();

    expect(redirectMock).toHaveBeenCalledWith('/agent-os');
  });
});
