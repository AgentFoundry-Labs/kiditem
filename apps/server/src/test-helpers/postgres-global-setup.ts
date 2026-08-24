import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    runnerInstallationTokenFile: string;
  }
}

const repoRoot = path.resolve(__dirname, '../../../..');

interface StartedPostgres {
  getConnectionUri(): string;
  stop(): Promise<unknown>;
}

interface DatabaseUrlProvider {
  provide(key: 'databaseUrl' | 'runnerInstallationTokenFile', value: string): void;
}

export interface EphemeralRunnerInstallationToken {
  directory: string;
  filePath: string;
}

export interface PostgresGlobalSetupDependencies {
  startPostgres(): Promise<StartedPostgres>;
  pushSchema(databaseUrl: string): void | Promise<void>;
  createRunnerInstallationToken(): Promise<EphemeralRunnerInstallationToken>;
  removeRunnerInstallationToken(token: EphemeralRunnerInstallationToken): Promise<void>;
}

export function createPostgresGlobalSetup(
  dependencies: PostgresGlobalSetupDependencies,
) {
  return async function setup(project: DatabaseUrlProvider) {
    const runnerToken = await dependencies.createRunnerInstallationToken();
    let container: StartedPostgres | null = null;

    try {
      container = await dependencies.startPostgres();
      const databaseUrl = container.getConnectionUri();
      await dependencies.pushSchema(databaseUrl);
      project.provide('databaseUrl', databaseUrl);
      project.provide('runnerInstallationTokenFile', runnerToken.filePath);
    } catch (error) {
      throwWithSetupCleanup(error, await cleanup(container, runnerToken, dependencies));
    }

    return async () => {
      throwWithTeardownCleanup(await cleanup(container, runnerToken, dependencies));
    };
  };
}

export async function createEphemeralRunnerInstallationToken(): Promise<EphemeralRunnerInstallationToken> {
  const directory = await mkdtemp(path.join(tmpdir(), 'kiditem-integration-runner-token-'));
  const filePath = path.join(directory, 'installation-token');
  try {
    await writeFile(filePath, randomBytes(32).toString('base64url'), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    if (process.platform !== 'win32') await chmod(filePath, 0o600);
    return { directory, filePath };
  } catch (error) {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Runner installation token setup and cleanup both failed',
      );
    }
    throw error;
  }
}

export async function removeEphemeralRunnerInstallationToken(
  token: EphemeralRunnerInstallationToken,
): Promise<void> {
  await rm(token.directory, { recursive: true, force: true });
}

async function cleanup(
  container: StartedPostgres | null,
  runnerToken: EphemeralRunnerInstallationToken,
  dependencies: PostgresGlobalSetupDependencies,
): Promise<unknown[]> {
  const errors: unknown[] = [];
  if (container) {
    try {
      await container.stop();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await dependencies.removeRunnerInstallationToken(runnerToken);
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

function throwWithSetupCleanup(error: unknown, cleanupErrors: unknown[]): never {
  if (cleanupErrors.length === 0) throw error;
  throw new AggregateError(
    [error, ...cleanupErrors],
    'Postgres integration setup and cleanup both failed',
  );
}

function throwWithTeardownCleanup(cleanupErrors: unknown[]): void {
  if (cleanupErrors.length === 0) return;
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  throw new AggregateError(
    cleanupErrors,
    'Postgres integration teardown cleanup failed',
  );
}

const setup = createPostgresGlobalSetup({
  startPostgres: () => new PostgreSqlContainer('postgres:17')
    .withDatabase('kiditem_test')
    .withUsername('kiditem_test')
    .withPassword('kiditem_test')
    .withCommand([
      'postgres',
      '-c',
      'shared_preload_libraries=pg_stat_statements',
    ])
    .start(),
  pushSchema: (databaseUrl) => {
    const prismaArgs = ['db', 'push'];

    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...prismaArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });
  },
  createRunnerInstallationToken: createEphemeralRunnerInstallationToken,
  removeRunnerInstallationToken: removeEphemeralRunnerInstallationToken,
});

export default setup;
