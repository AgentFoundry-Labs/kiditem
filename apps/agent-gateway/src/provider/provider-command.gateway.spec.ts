import { describe, expect, it, vi } from 'vitest';

describe('Gateway-owned provider command environment', () => {
  it('allows only Gateway-owned login and train fields, never a transport token or inherited shell environment', async () => {
    const { gatewayProviderInvocation, providerEnvironment } = await import('./provider-command');
    vi.stubEnv('PATH', '/usr/bin');
    vi.stubEnv('USER', 'gateway-user');
    try {
      const env = providerEnvironment({ home: '/gateway/login', providerHome: { key: 'CODEX_HOME', path: '/gateway/codex' }, includeMacosUserIdentity: true });
      expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/gateway/login', CODEX_HOME: '/gateway/codex', USER: 'gateway-user', CODEX_MCP_PROTOCOL_VERSION: '2026-07-28' });
      expect(env).not.toHaveProperty('KIDITEM_ATTEMPT_MCP_TOKEN');
      expect(env).not.toHaveProperty('SHELL');
      expect(env).not.toHaveProperty('TERM');
      expect(typeof gatewayProviderInvocation).toBe('function');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
