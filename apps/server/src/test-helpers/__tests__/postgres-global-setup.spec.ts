import { readFile, rm, stat } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createEphemeralRunnerInstallationToken,
  createPostgresGlobalSetup,
  type EphemeralRunnerInstallationToken,
  type PostgresGlobalSetupDependencies,
} from '../postgres-global-setup';

type StartedPostgres = {
  getConnectionUri: () => string;
  stop: () => Promise<void>;
};

function createStartedPostgres(databaseUrl: string) {
  const stop = vi.fn(async () => undefined);
  const container: StartedPostgres = {
    getConnectionUri: () => databaseUrl,
    stop,
  };

  return { container, stop };
}

function createRunnerInstallationToken() {
  const token: EphemeralRunnerInstallationToken = {
    directory: '/tmp/kiditem-integration-runner-token-123',
    filePath: '/tmp/kiditem-integration-runner-token-123/installation-token',
  };
  return {
    token,
    createToken: vi.fn(async () => token),
    removeToken: vi.fn(async () => undefined),
  };
}

function setupDependencies(
  startPostgres: () => Promise<StartedPostgres>,
  pushSchema: (databaseUrl: string) => void | Promise<void>,
  runnerToken = createRunnerInstallationToken(),
) {
  const dependencies = {
    startPostgres,
    pushSchema,
    createRunnerInstallationToken: runnerToken.createToken,
    removeRunnerInstallationToken: runnerToken.removeToken,
  } satisfies PostgresGlobalSetupDependencies;
  return {
    token: runnerToken.token,
    createToken: runnerToken.createToken,
    removeToken: runnerToken.removeToken,
    dependencies,
  };
}

describe('Postgres integration global setup orchestration', () => {
  it('creates an installation token and provides only its path after the schema is ready', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const events: string[] = [];
    const { container } = createStartedPostgres(databaseUrl);
    const startPostgres = vi.fn(async () => container);
    const pushSchema = vi.fn(async (url: string) => {
      events.push(`push:${url}`);
    });
    const runnerToken = createRunnerInstallationToken();
    runnerToken.createToken.mockImplementation(async () => {
      events.push('token:create');
      return runnerToken.token;
    });
    const { dependencies, token, createToken } = setupDependencies(
      startPostgres,
      pushSchema,
      runnerToken,
    );
    const provide = vi.fn((key: 'databaseUrl' | 'runnerInstallationTokenFile', value: string) => {
      events.push(`provide:${key}:${value}`);
    });

    const teardown = await createPostgresGlobalSetup(dependencies)({ provide });

    expect(startPostgres).toHaveBeenCalledTimes(1);
    expect(pushSchema).toHaveBeenCalledWith(databaseUrl);
    expect(createToken).toHaveBeenCalledTimes(1);
    expect(provide).toHaveBeenCalledWith('databaseUrl', databaseUrl);
    expect(provide).toHaveBeenCalledWith('runnerInstallationTokenFile', token.filePath);
    expect(events).toEqual([
      'token:create',
      `push:${databaseUrl}`,
      `provide:databaseUrl:${databaseUrl}`,
      `provide:runnerInstallationTokenFile:${token.filePath}`,
    ]);

    await teardown();
    expect(runnerToken.removeToken).toHaveBeenCalledWith(token);
  });

  it('stops the container and removes the token when schema setup fails', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const { container, stop } = createStartedPostgres(databaseUrl);
    const setupError = new Error('schema push failed');
    const provide = vi.fn();
    const runnerToken = createRunnerInstallationToken();
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => container),
      vi.fn(async () => {
        throw setupError;
      }),
      runnerToken,
    );
    const setup = createPostgresGlobalSetup(dependencies);

    await expect(setup({ provide })).rejects.toBe(setupError);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(runnerToken.removeToken).toHaveBeenCalledWith(token);
    expect(provide).not.toHaveBeenCalled();
  });

  it('preserves setup and both cleanup errors', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const { container } = createStartedPostgres(databaseUrl);
    const setupError = new Error('schema push failed');
    const cleanupError = new Error('container stop failed');
    const tokenCleanupError = new Error('runner token cleanup failed');
    const stop = vi.fn(async () => {
      throw cleanupError;
    });
    container.stop = stop;
    const provide = vi.fn();
    const runnerToken = createRunnerInstallationToken();
    runnerToken.removeToken.mockRejectedValueOnce(tokenCleanupError);
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => container),
      vi.fn(async () => {
        throw setupError;
      }),
      runnerToken,
    );
    const setup = createPostgresGlobalSetup(dependencies);

    let thrown: unknown;
    try {
      await setup({ provide });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([
      setupError,
      cleanupError,
      tokenCleanupError,
    ]);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(runnerToken.removeToken).toHaveBeenCalledWith(token);
    expect(provide).not.toHaveBeenCalled();
  });

  it('removes the exact token directory when starting the container fails', async () => {
    const startError = new Error('container start failed');
    const runnerToken = createRunnerInstallationToken();
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => {
        throw startError;
      }),
      vi.fn(),
      runnerToken,
    );

    await expect(createPostgresGlobalSetup(dependencies)({ provide: vi.fn() }))
      .rejects.toBe(startError);

    expect(runnerToken.removeToken).toHaveBeenCalledTimes(1);
    expect(runnerToken.removeToken).toHaveBeenCalledWith(token);
  });

  it('returns a teardown that stops the started container and removes the exact token directory', async () => {
    const { container, stop } = createStartedPostgres(
      'postgresql://kiditem_test:secret@localhost:6543/kiditem_test',
    );
    const runnerToken = createRunnerInstallationToken();
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => container),
      vi.fn(),
      runnerToken,
    );
    const setup = createPostgresGlobalSetup(dependencies);

    const teardown = await setup({ provide: vi.fn() });
    expect(stop).not.toHaveBeenCalled();

    await teardown();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(runnerToken.removeToken).toHaveBeenCalledWith(token);
  });

  it('creates a 32-byte unpadded base64url token in a private ephemeral file', async () => {
    const token = await createEphemeralRunnerInstallationToken();
    try {
      const raw = await readFile(token.filePath, 'utf8');
      expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
      if (process.platform !== 'win32') {
        expect((await stat(token.filePath)).mode & 0o777).toBe(0o600);
      }
    } finally {
      await rm(token.directory, { recursive: true, force: true });
    }
  });
});
