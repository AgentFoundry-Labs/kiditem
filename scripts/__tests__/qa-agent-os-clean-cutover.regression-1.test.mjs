import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const helperPath = path.join(
  process.cwd(),
  'scripts',
  'qa-agent-os-clean-cutover.mjs',
);

// Regression: ISSUE-001 — a clean browser-QA checkout started the API before
// @kiditem/templates had produced the compiled stylesheet required at boot.
// Found by /qa on 2026-08-26
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-26.md
test('builds template assets before the browser-QA server build and process start', async () => {
  const helper = await import(pathToFileURL(helperPath).href);
  const events = [];
  const databaseName = `${helper.GENERATED_DATABASE_MARKER}_0123456789abcdef`;
  const databaseUrl = `postgresql://qa_agent_os@127.0.0.1:55432/${databaseName}`;
  const child = { exitCode: 0 };

  await helper.runCleanCutover({
    args: ['--serve-browser-qa', '--email', 'browser.qa@example.test'],
    dependencies: {
      createDatabaseName: () => databaseName,
      startPostgres: async () => ({
        getConnectionUri: () => databaseUrl,
        getHost: () => '127.0.0.1',
        getMappedPort: () => 55432,
        stop: async () => events.push('container:stop'),
      }),
      installLegacyFixture: async () => events.push('fixture:install'),
      runCommand: async ({ step }) => events.push(`command:${step}`),
      assertCleanCutover: async () => events.push('cutover:verify'),
      runInvocationTests: async () => events.push('invocations:verify'),
      assertBrowserQaInteractiveStdin: () => events.push('stdin:verify'),
      assertBrowserQaEmailConfigured: () => events.push('email:verify'),
      createBrowserQaSeedCommand: () => ({ command: 'npm', args: ['run', 'seed'] }),
      seedBrowserQaBundle: async () => events.push('browser-qa:seed'),
      startBrowserQaStack: async () => {
        events.push('browser-qa:start');
        return [child];
      },
      reportPublicUrls: () => events.push('browser-qa:urls'),
      waitForShutdown: async () => events.push('browser-qa:wait'),
      stopBrowserQaStack: async () => events.push('browser-qa:stop'),
    },
  });

  const templatesBuild = events.indexOf('command:templates-build');
  const serverBuild = events.indexOf('command:server-build');
  const processStart = events.indexOf('browser-qa:start');

  assert.ok(templatesBuild >= 0, 'browser QA must build @kiditem/templates');
  assert.ok(templatesBuild < serverBuild, 'template assets must exist before the server build');
  assert.ok(serverBuild < processStart, 'all build inputs must exist before process start');
});
