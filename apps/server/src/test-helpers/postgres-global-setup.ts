import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const repoRoot = path.resolve(__dirname, '../../../..');

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:17')
    .withDatabase('kiditem_test')
    .withUsername('kiditem_test')
    .withPassword('kiditem_test')
    .start();

  try {
    const databaseUrl = container.getConnectionUri();
    const prismaArgs = ['db', 'push', '--accept-data-loss'];

    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...prismaArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });

    project.provide('databaseUrl', databaseUrl);
  } catch (error) {
    await container.stop();
    throw error;
  }

  return async () => {
    await container.stop();
  };
}
