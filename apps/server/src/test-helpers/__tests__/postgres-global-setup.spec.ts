import { readFile, rm, stat } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createEphemeralGatewayInstallationToken,
  createPostgresGlobalSetup,
  type EphemeralGatewayInstallationToken,
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

function createGatewayInstallationToken() {
  const token: EphemeralGatewayInstallationToken = {
    directory: '/tmp/kiditem-integration-gateway-token-123',
    filePath: '/tmp/kiditem-integration-gateway-token-123/installation-token',
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
  gatewayToken = createGatewayInstallationToken(),
  applyDatabaseObjects: (databaseUrl: string) => Promise<void> = vi.fn(async () => undefined),
) {
  const dependencies = {
    startPostgres,
    pushSchema,
    applyDatabaseObjects,
    createGatewayInstallationToken: gatewayToken.createToken,
    removeGatewayInstallationToken: gatewayToken.removeToken,
  } satisfies PostgresGlobalSetupDependencies;
  return {
    token: gatewayToken.token,
    createToken: gatewayToken.createToken,
    removeToken: gatewayToken.removeToken,
    dependencies,
  };
}

describe('Postgres integration global setup orchestration', () => {
  it('creates an installation token and provides hermetic runtime values after the schema is ready', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const events: string[] = [];
    const { container } = createStartedPostgres(databaseUrl);
    const startPostgres = vi.fn(async () => container);
    const pushSchema = vi.fn(async (url: string) => {
      events.push(`push:${url}`);
    });
    const applyDatabaseObjects = vi.fn(async (url: string) => {
      events.push(`objects:${url}`);
    });
    const gatewayToken = createGatewayInstallationToken();
    gatewayToken.createToken.mockImplementation(async () => {
      events.push('token:create');
      return gatewayToken.token;
    });
    const { dependencies, token, createToken } = setupDependencies(
      startPostgres,
      pushSchema,
      gatewayToken,
      applyDatabaseObjects,
    );
    const provide = vi.fn((key: 'databaseUrl' | 'gatewayInstallationTokenFile' | 'webOrigin', value: string) => {
      events.push(`provide:${key}:${value}`);
    });

    const teardown = await createPostgresGlobalSetup(dependencies)({ provide });

    expect(startPostgres).toHaveBeenCalledTimes(1);
    expect(pushSchema).toHaveBeenCalledWith(databaseUrl);
    expect(createToken).toHaveBeenCalledTimes(1);
    expect(provide).toHaveBeenCalledWith('databaseUrl', databaseUrl);
    expect(provide).toHaveBeenCalledWith('gatewayInstallationTokenFile', token.filePath);
    expect(provide).toHaveBeenCalledWith('webOrigin', 'http://127.0.0.1:3000');
    expect(events).toEqual([
      'token:create',
      `push:${databaseUrl}`,
      `objects:${databaseUrl}`,
      `provide:databaseUrl:${databaseUrl}`,
      `provide:gatewayInstallationTokenFile:${token.filePath}`,
      'provide:webOrigin:http://127.0.0.1:3000',
    ]);

    await teardown();
    expect(gatewayToken.removeToken).toHaveBeenCalledWith(token);
  });

  it('stops the container and removes the token when schema setup fails', async () => {
    const databaseUrl = 'postgresql://kiditem_test:secret@localhost:6543/kiditem_test';
    const { container, stop } = createStartedPostgres(databaseUrl);
    const setupError = new Error('schema push failed');
    const provide = vi.fn();
    const applyDatabaseObjects = vi.fn(async () => undefined);
    const gatewayToken = createGatewayInstallationToken();
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => container),
      vi.fn(async () => {
        throw setupError;
      }),
      gatewayToken,
      applyDatabaseObjects,
    );
    const setup = createPostgresGlobalSetup(dependencies);

    await expect(setup({ provide })).rejects.toBe(setupError);

    expect(applyDatabaseObjects).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(gatewayToken.removeToken).toHaveBeenCalledWith(token);
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
    const gatewayToken = createGatewayInstallationToken();
    gatewayToken.removeToken.mockRejectedValueOnce(tokenCleanupError);
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => container),
      vi.fn(async () => {
        throw setupError;
      }),
      gatewayToken,
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
    expect(gatewayToken.removeToken).toHaveBeenCalledWith(token);
    expect(provide).not.toHaveBeenCalled();
  });

  it('removes the exact token directory when starting the container fails', async () => {
    const startError = new Error('container start failed');
    const gatewayToken = createGatewayInstallationToken();
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => {
        throw startError;
      }),
      vi.fn(),
      gatewayToken,
    );

    await expect(createPostgresGlobalSetup(dependencies)({ provide: vi.fn() }))
      .rejects.toBe(startError);

    expect(gatewayToken.removeToken).toHaveBeenCalledTimes(1);
    expect(gatewayToken.removeToken).toHaveBeenCalledWith(token);
  });

  it('returns a teardown that stops the started container and removes the exact token directory', async () => {
    const { container, stop } = createStartedPostgres(
      'postgresql://kiditem_test:secret@localhost:6543/kiditem_test',
    );
    const gatewayToken = createGatewayInstallationToken();
    const { dependencies, token } = setupDependencies(
      vi.fn(async () => container),
      vi.fn(),
      gatewayToken,
    );
    const setup = createPostgresGlobalSetup(dependencies);

    const teardown = await setup({ provide: vi.fn() });
    expect(stop).not.toHaveBeenCalled();

    await teardown();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(gatewayToken.removeToken).toHaveBeenCalledWith(token);
  });

  it('creates a 32-byte unpadded base64url token in a private ephemeral file', async () => {
    const token = await createEphemeralGatewayInstallationToken();
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
