import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const repoRoot = path.resolve(__dirname, '../../../..');

interface StartedPostgres {
  getConnectionUri(): string;
  stop(): Promise<unknown>;
}

interface DatabaseUrlProvider {
  provide(key: 'databaseUrl', value: string): void;
}

export interface PostgresGlobalSetupDependencies {
  startPostgres(): Promise<StartedPostgres>;
  pushSchema(databaseUrl: string): void | Promise<void>;
}

export function createPostgresGlobalSetup(
  dependencies: PostgresGlobalSetupDependencies,
) {
  return async function setup(project: DatabaseUrlProvider) {
    const container = await dependencies.startPostgres();

    try {
      const databaseUrl = container.getConnectionUri();
      await dependencies.pushSchema(databaseUrl);
      project.provide('databaseUrl', databaseUrl);
    } catch (error) {
      try {
        await container.stop();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Postgres integration setup and cleanup both failed',
        );
      }
      throw error;
    }

    return async () => {
      await container.stop();
    };
  };
}

const setup = createPostgresGlobalSetup({
  startPostgres: () => new PostgreSqlContainer('postgres:17')
    .withDatabase('kiditem_test')
    .withUsername('kiditem_test')
    .withPassword('kiditem_test')
    .start(),
  pushSchema: (databaseUrl) => {
    const prismaArgs = ['db', 'push', '--accept-data-loss'];

    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...prismaArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });
  },
});

export default setup;
