import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function readWorkflowJobSource(workflowSource: string, jobName: string): string {
  const lines = workflowSource.split('\n');
  const jobStart = lines.indexOf(`  ${jobName}:`);

  if (jobStart === -1) return '';

  const nextJobOffset = lines
    .slice(jobStart + 1)
    .findIndex((line) => /^  [\w-]+:$/.test(line));
  const jobEnd = nextJobOffset === -1
    ? lines.length
    : jobStart + nextJobOffset + 1;

  return lines.slice(jobStart, jobEnd).join('\n');
}

function readWorkflowJobNames(workflowSource: string): string[] {
  const jobsSource = workflowSource.split('\njobs:\n')[1] ?? '';

  return jobsSource
    .split('\n')
    .filter((line) => /^  [\w-]+:$/.test(line))
    .map((line) => line.trim().slice(0, -1));
}

describe('integration test runtime contract', () => {
  it('delegates focused integration runs without manual database scripts', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts).not.toHaveProperty('db:test:up');
    expect(packageJson.scripts).not.toHaveProperty('db:test:down');
    expect(packageJson.scripts).not.toHaveProperty('db:test:prepare');
    expect(packageJson.scripts?.['test:integration']).toBe(
      'npm run test:integration --workspace=apps/server --',
    );
    expect(packageJson.devDependencies).toHaveProperty('@testcontainers/postgresql');
  });

  it('keeps PR checks lightweight and validates develop with the real Postgres suite', () => {
    const prWorkflowSource = readRepoFile('.github/workflows/pr-checks.yml');
    const prJobSource = readWorkflowJobSource(prWorkflowSource, 'pr-hygiene');

    expect(readWorkflowJobNames(prWorkflowSource)).toEqual(['pr-hygiene']);
    expect(prJobSource).toContain('runs-on: ubuntu-latest');
    expect(prJobSource).toContain('run: git diff --check "${BASE_SHA}...HEAD"');
    expect(prWorkflowSource).not.toContain('actions/setup-node');
    expect(prWorkflowSource).not.toContain('npm ci');
    expect(prWorkflowSource).not.toContain('npm run build');
    expect(prWorkflowSource).not.toContain('test:integration');

    const developWorkflowSource = readRepoFile(
      '.github/workflows/develop-validation.yml',
    );
    const developJobSource = readWorkflowJobSource(
      developWorkflowSource,
      'full-validation',
    );

    expect(readWorkflowJobNames(developWorkflowSource)).toEqual([
      'full-validation',
    ]);
    expect(developWorkflowSource).toContain('push:');
    expect(developWorkflowSource).toContain('      - develop');
    expect(developWorkflowSource).toContain('cancel-in-progress: true');
    expect(developJobSource).toContain('runs-on: ubuntu-latest');
    expect(developJobSource).toContain('timeout-minutes: 20');
    expect(developJobSource).toContain('contents: read');
    expect(developJobSource).toContain(
      'DATABASE_URL: postgresql://kiditem_ci:kiditem_ci@localhost:5432/kiditem_ci',
    );
    expect(developJobSource).toContain('node-version: 22');
    expect(developJobSource).toContain('cache: npm');
    expect(developJobSource).toContain('run: npm ci --ignore-scripts');
    expect(developJobSource).toContain('run: npx prisma generate');
    expect(developJobSource).toContain(
      'npm run build --workspace=packages/shared',
    );
    expect(developJobSource).toContain(
      'npm run build --workspace=packages/templates',
    );
    expect(developJobSource).toContain(
      'npm run build --workspace=apps/server',
    );
    expect(developJobSource).toContain(
      'npm run build --workspace=apps/web',
    );
    expect(developJobSource).toContain(
      'run: npm exec --workspace=apps/server vitest -- run src/test-helpers/__tests__/postgres-global-setup.spec.ts src/test-helpers/__tests__/real-prisma.spec.ts',
    );
    expect(developJobSource).toContain('run: npm run test:integration');
  });

  it('removes the legacy fixed-port database lifecycle files', () => {
    expect(existsSync(join(repoRoot, '.env.test.example'))).toBe(false);
    expect(existsSync(join(repoRoot, 'docker-compose.test.yml'))).toBe(false);
    expect(existsSync(join(repoRoot, 'prisma/test-db-setup.sh'))).toBe(false);
  });

  it('registers integration setup files with dynamic container configuration', () => {
    const configSource = readRepoFile('apps/server/vitest.config.integration.ts');
    const globalSetupPath = 'apps/server/src/test-helpers/postgres-global-setup.ts';
    const testEnvSetupPath = 'apps/server/src/test-helpers/postgres-test-env.setup.ts';

    expect(configSource).toContain("globalSetup: './src/test-helpers/postgres-global-setup.ts'");
    expect(configSource).toContain("setupFiles: ['./src/test-helpers/postgres-test-env.setup.ts']");
    expect(configSource).toContain('fileParallelism: false');
    expect(configSource).toContain('isolate: false');
    expect(existsSync(join(repoRoot, globalSetupPath))).toBe(true);
    expect(existsSync(join(repoRoot, testEnvSetupPath))).toBe(true);

    const globalSetupSource = readRepoFile(globalSetupPath);
    const testEnvSetupSource = readRepoFile(testEnvSetupPath);

    expect(globalSetupSource).toContain("new PostgreSqlContainer('postgres:17')");
    expect(globalSetupSource).toContain(".withDatabase('kiditem_test')");
    expect(globalSetupSource).toContain(".withUsername('kiditem_test')");
    expect(globalSetupSource).toContain(".withPassword('kiditem_test')");
    expect(testEnvSetupSource).toContain("inject('databaseUrl')");
    expect(testEnvSetupSource).toContain('process.env.DATABASE_URL = databaseUrl');
  });

  it('does not configure a fixed host port or container name', () => {
    const globalSetupSource = readRepoFile(
      'apps/server/src/test-helpers/postgres-global-setup.ts',
    );

    expect(globalSetupSource).not.toContain('.withExposedPorts(');
    expect(globalSetupSource).not.toContain('.withFixedExposedPort(');
    expect(globalSetupSource).not.toContain('.withName(');
  });

  it('keeps integration runtime helpers out of the production server build', () => {
    const buildConfig = JSON.parse(readRepoFile('apps/server/tsconfig.build.json')) as {
      exclude?: string[];
    };

    expect(buildConfig.exclude).toEqual(expect.arrayContaining([
      'src/test-helpers/postgres-global-setup.ts',
      'src/test-helpers/postgres-test-env.setup.ts',
    ]));
  });

  it('does not retain the fixed test database port in runtime-owned surfaces', () => {
    for (const relativePath of [
      '.env.test.example',
      'package.json',
      'apps/server/vitest.config.integration.ts',
      'apps/server/src/test-helpers/postgres-global-setup.ts',
      'apps/server/src/test-helpers/postgres-test-env.setup.ts',
      'apps/server/src/test-helpers/real-prisma.ts',
      'apps/server/src/automation/adapter/out/panel-event/__tests__/panel-pr3.integration.spec.ts',
      'apps/server/src/automation/adapter/out/panel-event/__tests__/panel-pr3.pg.integration.spec.ts',
      'docs/TESTING.md',
    ]) {
      if (!existsSync(join(repoRoot, relativePath))) continue;
      expect(readRepoFile(relativePath), relativePath).not.toContain('5434');
    }
  });
});
