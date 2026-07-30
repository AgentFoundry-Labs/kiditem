import { describe, expect, it, vi } from 'vitest';
import { runAuthAdmin } from './auth-admin';

describe('auth-admin CLI', () => {
  it('reads password only from stdin and never writes it to output', async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn();

    await runAuthAdmin({
      argv: ['set-password', '--email', 'operator@example.com', '--password-stdin'],
      readStdin: async () => 'correct horse battery staple\n',
      write,
      service: { setPassword, revokeAllSessions: vi.fn() },
    });

    expect(setPassword).toHaveBeenCalledWith(
      'operator@example.com',
      'correct horse battery staple',
    );
    expect(write).toHaveBeenCalledWith('password updated; all sessions revoked\n');
    expect(write.mock.calls.flat().join('')).not.toContain('correct horse');
  });

  it('rejects password values on argv', async () => {
    await expect(
      runAuthAdmin({
        argv: ['set-password', '--email', 'operator@example.com', '--password', 'secret123'],
        readStdin: async () => '',
        write: vi.fn(),
        service: { setPassword: vi.fn(), revokeAllSessions: vi.fn() },
      }),
    ).rejects.toThrow(/--password-stdin/);
  });

  it('revokes all sessions for the selected existing user', async () => {
    const revokeAllSessions = vi.fn().mockResolvedValue(undefined);

    await runAuthAdmin({
      argv: ['revoke-sessions', '--email', 'operator@example.com'],
      readStdin: async () => '',
      write: vi.fn(),
      service: { setPassword: vi.fn(), revokeAllSessions },
    });

    expect(revokeAllSessions).toHaveBeenCalledWith('operator@example.com');
  });
});
