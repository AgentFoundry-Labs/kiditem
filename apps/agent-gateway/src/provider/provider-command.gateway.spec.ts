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

  it('preserves only the Windows bootstrap environment required by Node and provider child processes', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    expect(platform).toBeDefined();
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    vi.stubEnv('SystemRoot', 'C:\\Windows');
    vi.stubEnv('windir', 'C:\\Windows');
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe');
    vi.stubEnv('Temp', 'C:\\Windows\\Temp');
    vi.stubEnv('tmp', 'C:\\Windows\\Temp');
    vi.stubEnv('UNRELATED_WINDOWS_SECRET', 'must-not-cross');

    try {
      const { providerEnvironment } = await import('./provider-command');
      const env = providerEnvironment({ home: 'C:\\KidItem\\login' });

      expect(env).toMatchObject({
        SYSTEMROOT: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
        TEMP: 'C:\\Windows\\Temp',
        TMP: 'C:\\Windows\\Temp',
      });
      expect(env).not.toHaveProperty('UNRELATED_WINDOWS_SECRET');
    } finally {
      Object.defineProperty(process, 'platform', platform!);
      vi.unstubAllEnvs();
    }
  });
});
