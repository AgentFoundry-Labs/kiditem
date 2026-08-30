import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helperPath = path.join(repoRoot, 'scripts/qa-agent-os-clean-cutover.mjs');

async function loadHelper() {
  return import(pathToFileURL(helperPath).href);
}

function createIsolatedTarget(helper, overrides = {}) {
  const databaseName = overrides.databaseName ?? helper.createGeneratedDatabaseName(
    () => Buffer.from('a1b2c3d4e5f60708', 'hex'),
  );
  const target = {
    databaseUrl: `postgresql://fixture_user:fixture_password@127.0.0.1:55432/${databaseName}`,
    containerHost: '127.0.0.1',
    mappedPort: 55432,
    databaseName,
  };

  return { ...target, ...overrides };
}

function createRunDependencies(helper, options = {}) {
  const events = [];
  const commandCalls = [];
  const browserQaSeedCommands = [];
  const databaseName = options.databaseName ?? helper.createGeneratedDatabaseName(
    () => Buffer.from('0123456789abcdef', 'hex'),
  );
  const target = createIsolatedTarget(helper, { databaseName, ...options.target });
  const container = {
    getConnectionUri: () => target.databaseUrl,
    getHost: () => target.containerHost,
    getMappedPort: (port) => {
      assert.equal(port, 5432);
      return target.mappedPort;
    },
    stop: async () => {
      events.push('container:stop');
    },
  };
  const dependencies = {
    createDatabaseName: () => databaseName,
    startPostgres: async ({ databaseName: requestedDatabaseName }) => {
      events.push(`container:start:${requestedDatabaseName}`);
      return container;
    },
    installLegacyFixture: async ({ databaseUrl, retiredTables }) => {
      events.push('fixture:install');
      assert.equal(databaseUrl, target.databaseUrl);
      assert.deepEqual(retiredTables, helper.RETIRED_AGENT_OS_TABLES);
    },
    runCommand: async (command) => {
      events.push(`command:${command.step}`);
      commandCalls.push(command);
      if (command.step === options.failCommandStep) {
        throw new Error(`${command.step} failed`);
      }
    },
    assertCleanCutover: async ({ databaseUrl, retiredTables }) => {
      events.push('schema:assert');
      assert.equal(databaseUrl, target.databaseUrl);
      assert.deepEqual(retiredTables, helper.RETIRED_AGENT_OS_TABLES);
    },
    runInvocationTests: async ({ databaseUrl }) => {
      events.push('invocation-tests:run');
      assert.equal(databaseUrl, target.databaseUrl);
    },
    assertBrowserQaInteractiveStdin: async () => {},
    assertBrowserQaEmailConfigured: async ({ email }) => {
      assert.equal(email, options.browserQaEmail ?? 'browser.qa@example.test');
    },
    createBrowserQaSeedCommand: async ({ email }) => {
      browserQaSeedCommands.push(email);
      return {
        command: 'npm',
        args: ['run', 'seed:agent-os:browser-qa', '--', '--email', email],
      };
    },
    seedBrowserQaBundle: async ({ databaseUrl, target: seedTarget, seedCommand }) => {
      events.push('browser-qa:seed');
      assert.equal(databaseUrl, target.databaseUrl);
      assert.equal(seedTarget.databaseName, target.databaseName);
      assert.deepEqual(seedCommand, {
        command: 'npm',
        args: ['run', 'seed:agent-os:browser-qa', '--', '--email', options.browserQaEmail ?? 'browser.qa@example.test'],
      });
    },
    startBrowserQaStack: async ({ databaseUrl }) => {
      events.push('browser-qa:start');
      assert.equal(databaseUrl, target.databaseUrl);
      return [{ name: 'api' }, { name: 'worker' }, { name: 'web' }];
    },
    stopBrowserQaStack: async (children) => {
      events.push(`browser-qa:stop:${children.length}`);
    },
    waitForShutdown: async () => {
      events.push('browser-qa:wait');
    },
    reportPublicUrls: (urls) => {
      events.push(`browser-qa:urls:${urls.webUrl},${urls.apiUrl}`);
    },
  };

  return { browserQaSeedCommands, commandCalls, dependencies, events, target };
}

test('generates a marked, unique database name for the isolated clean-cutover container', async () => {
  assert.equal(
    existsSync(helperPath),
    true,
    'the isolated clean-cutover helper must exist',
  );
  if (!existsSync(helperPath)) return;

  const helper = await loadHelper();
  const first = helper.createGeneratedDatabaseName();
  const second = helper.createGeneratedDatabaseName();

  assert.match(first, new RegExp(`^${helper.GENERATED_DATABASE_MARKER}_[a-f0-9]+$`));
  assert.match(second, new RegExp(`^${helper.GENERATED_DATABASE_MARKER}_[a-f0-9]+$`));
  assert.notEqual(first, second);
});

test('uses the exact retired physical Agent OS table names in the disposable fixture', async () => {
  const helper = await loadHelper();

  assert.deepEqual(helper.RETIRED_AGENT_OS_TABLES, [
    'agent_work_versions',
    'agent_work_sessions',
    'agent_work_tasks',
    'agent_attempts',
    'agent_capability_invocations',
    'agent_capability_approvals',
  ]);
});

test('accepts only the started Testcontainer endpoint with its generated database name', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.assertIsolatedTestcontainerTarget, 'function');
  if (typeof helper.assertIsolatedTestcontainerTarget !== 'function') return;

  assert.doesNotThrow(() => {
    helper.assertIsolatedTestcontainerTarget(createIsolatedTarget(helper));
  });
});

test('accepts the postgres URI scheme emitted by the started Testcontainer', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.assertIsolatedTestcontainerTarget, 'function');
  if (typeof helper.assertIsolatedTestcontainerTarget !== 'function') return;

  const target = createIsolatedTarget(helper);
  assert.doesNotThrow(() => {
    helper.assertIsolatedTestcontainerTarget({
      ...target,
      databaseUrl: target.databaseUrl.replace(/^postgresql:/, 'postgres:'),
    });
  });
});

test('refuses a non-Testcontainer database endpoint before schema work', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.assertIsolatedTestcontainerTarget, 'function');
  if (typeof helper.assertIsolatedTestcontainerTarget !== 'function') return;

  const target = createIsolatedTarget(helper, {
    databaseUrl: `postgresql://fixture_user:fixture_password@developer-db.example:55432/${helper.createGeneratedDatabaseName()}`,
  });

  assert.throws(
    () => helper.assertIsolatedTestcontainerTarget(target),
    /non-Testcontainer/i,
  );
});

test('refuses an Office host even when its port and database name appear isolated', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.assertIsolatedTestcontainerTarget, 'function');
  if (typeof helper.assertIsolatedTestcontainerTarget !== 'function') return;

  const databaseName = helper.createGeneratedDatabaseName();
  assert.throws(
    () => helper.assertIsolatedTestcontainerTarget({
      databaseUrl: `postgresql://fixture_user:fixture_password@kiditem-office:55432/${databaseName}`,
      containerHost: 'kiditem-office',
      mappedPort: 55432,
      databaseName,
    }),
    /Office host/i,
  );
});

test('refuses a default development database name before fixture installation', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.assertIsolatedTestcontainerTarget, 'function');
  if (typeof helper.assertIsolatedTestcontainerTarget !== 'function') return;

  assert.throws(
    () => helper.assertIsolatedTestcontainerTarget({
      databaseUrl: 'postgresql://fixture_user:fixture_password@127.0.0.1:55432/kiditem',
      containerHost: '127.0.0.1',
      mappedPort: 55432,
      databaseName: 'kiditem',
    }),
    /default development database/i,
  );
});

test('refuses a database name without the helper-generated marker', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.assertIsolatedTestcontainerTarget, 'function');
  if (typeof helper.assertIsolatedTestcontainerTarget !== 'function') return;

  assert.throws(
    () => helper.assertIsolatedTestcontainerTarget({
      databaseUrl: 'postgresql://fixture_user:fixture_password@127.0.0.1:55432/kiditem_qa_unmarked',
      containerHost: '127.0.0.1',
      mappedPort: 55432,
      databaseName: 'kiditem_qa_unmarked',
    }),
    /generated marker/i,
  );
});

test('refuses force-reset and unsupported command-line arguments', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.assertSafeCleanCutoverArgs, 'function');
  if (typeof helper.assertSafeCleanCutoverArgs !== 'function') return;

  assert.doesNotThrow(() => helper.assertSafeCleanCutoverArgs([
    '--serve-browser-qa',
    '--email',
    'browser.qa@example.test',
  ]));
  assert.throws(
    () => helper.assertSafeCleanCutoverArgs(['--email', 'browser.qa@example.test']),
    /only with --serve-browser-qa/i,
  );
  assert.throws(
    () => helper.assertSafeCleanCutoverArgs(['--force-reset']),
    /force-reset.*blocked/i,
  );
  assert.throws(
    () => helper.assertSafeCleanCutoverArgs(['--unexpected']),
    /unsupported argument/i,
  );
});

test('runs all clean-cutover mutations only after validating the started Testcontainer target', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const { commandCalls, dependencies, events, target } = createRunDependencies(helper);
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://developer:password@localhost:5432/kiditem';

  try {
    const result = await helper.runCleanCutover({ dependencies });

    assert.deepEqual(result, {
      databaseName: target.databaseName,
      mode: 'verify',
    });
    assert.deepEqual(events, [
      `container:start:${target.databaseName}`,
      'fixture:install',
      'command:db-push',
      'command:prisma-generate',
      'command:shared-build',
      'schema:assert',
      'invocation-tests:run',
      'container:stop',
    ]);
    assert.equal(process.env.DATABASE_URL, 'postgresql://developer:password@localhost:5432/kiditem');
    assert.deepEqual(
      commandCalls.map(({ step, command, args, env }) => ({
        step,
        command,
        args,
        databaseUrl: env.DATABASE_URL,
      })),
      [
        {
          step: 'db-push',
          command: 'npm',
          args: ['run', 'db:push', '--', '--accept-data-loss'],
          databaseUrl: target.databaseUrl,
        },
        {
          step: 'prisma-generate',
          command: 'npx',
          args: ['prisma', 'generate'],
          databaseUrl: target.databaseUrl,
        },
        {
          step: 'shared-build',
          command: 'npm',
          args: ['run', 'build', '--workspace=packages/shared'],
          databaseUrl: target.databaseUrl,
        },
      ],
    );
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test('forwards externally supplied Prisma consent only to the post-guard isolated db-push child', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const consent = 'fresh isolated Testcontainer approval';
  const { commandCalls, dependencies } = createRunDependencies(helper);
  dependencies.prismaUserConsent = consent;
  const originalConsent = process.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION;
  process.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION = 'ambient approval that must not leak';

  try {
    await helper.runCleanCutover({ dependencies });
    const dbPush = commandCalls.find((call) => call.step === 'db-push');
    const otherCommands = commandCalls.filter((call) => call.step !== 'db-push');

    assert.equal(
      dbPush?.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION,
      consent,
    );
    for (const command of otherCommands) {
      assert.equal(command.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION, undefined);
    }
  } finally {
    if (originalConsent === undefined) {
      delete process.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION;
    } else {
      process.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION = originalConsent;
    }
  }
});

test('refuses an unsafe target before fixture or schema mutation and still removes the started container', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const { commandCalls, dependencies, events } = createRunDependencies(helper, {
    target: {
      databaseUrl: `postgresql://fixture_user:fixture_password@outside.example:55432/${helper.createGeneratedDatabaseName()}`,
    },
  });
  dependencies.prismaUserConsent = 'fresh isolated Testcontainer approval';

  await assert.rejects(
    () => helper.runCleanCutover({ dependencies }),
    /non-Testcontainer/i,
  );
  assert.equal(commandCalls.length, 0);
  assert.equal(
    commandCalls.some((call) => call.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION),
    false,
  );
  assert.deepEqual(events, [
    `container:start:${dependencies.createDatabaseName()}`,
    'container:stop',
  ]);
});

test('refuses force-reset before it can start a container or mutate a database', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const { dependencies, events } = createRunDependencies(helper);
  await assert.rejects(
    () => helper.runCleanCutover({ args: ['--force-reset'], dependencies }),
    /force-reset.*blocked/i,
  );
  assert.deepEqual(events, []);
});

test('stops and removes the Testcontainer when a clean-cutover command fails', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const { dependencies, events } = createRunDependencies(helper, {
    failCommandStep: 'shared-build',
  });
  await assert.rejects(
    () => helper.runCleanCutover({ dependencies }),
    /shared-build failed/,
  );
  assert.deepEqual(events.slice(-2), ['command:shared-build', 'container:stop']);
});

test('serve-browser-qa keeps the verified container alive only until shutdown and never reports credentials', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const { dependencies, events, target } = createRunDependencies(helper);
  const result = await helper.runCleanCutover({
    args: ['--serve-browser-qa', '--email', 'browser.qa@example.test'],
    dependencies,
  });

  assert.deepEqual(result, {
    databaseName: target.databaseName,
    mode: 'serve-browser-qa',
  });
  assert.deepEqual(events.slice(-8), [
    'browser-qa:seed',
    'command:templates-build',
    'command:server-build',
    'browser-qa:start',
    'browser-qa:urls:http://127.0.0.1:3000,http://127.0.0.1:4000',
    'browser-qa:wait',
    'browser-qa:stop:3',
    'container:stop',
  ]);
  assert.doesNotMatch(events.join('\n'), /fixture_password|postgresql:/i);
});

test('builds the server after the guard and before starting the browser-QA child stack', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const { commandCalls, dependencies, events, target } = createRunDependencies(helper);
  await helper.runCleanCutover({
    args: ['--serve-browser-qa', '--email', 'browser.qa@example.test'],
    dependencies,
  });

  const serverBuild = commandCalls.find((command) => command.step === 'server-build');
  assert.deepEqual(serverBuild && {
    command: serverBuild.command,
    args: serverBuild.args,
    databaseUrl: serverBuild.env.DATABASE_URL,
    consent: serverBuild.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION,
  }, {
    command: 'npm',
    args: ['run', 'build', '--workspace=apps/server'],
    databaseUrl: target.databaseUrl,
    consent: undefined,
  });
  assert.ok(events.indexOf('command:server-build') < events.indexOf('browser-qa:start'));
});

test('uses built API and worker commands with only safe local public origins for browser QA', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.createBrowserQaChildSpecs, 'function');
  if (typeof helper.createBrowserQaChildSpecs !== 'function') return;

  const target = createIsolatedTarget(helper);
  const children = helper.createBrowserQaChildSpecs(target.databaseUrl, {
    CORS_ORIGINS: 'https://unsafe.example',
    DATABASE_URL: 'postgresql://developer:password@localhost:5432/kiditem',
    NEXT_PUBLIC_API_URL: 'https://unsafe.example/api',
    MCP_PROTOCOL_NEGOTIATION: 'legacy',
    MCP_SDK_GENERATION: 'v1',
    PORT: '9999',
    PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'must-not-leak',
    WEB_ORIGIN: 'https://unsafe.example',
  });

  assert.deepEqual(
    children.map(({ name, command, args }) => ({ name, command, args })),
    [
      {
        name: 'API',
        command: 'npm',
        args: ['run', 'start:prod', '--workspace=apps/server'],
      },
      {
        name: 'Operations worker',
        command: 'npm',
        args: ['run', 'start:worker:prod', '--workspace=apps/server'],
      },
      {
        name: 'Web',
        command: 'npm',
        args: ['run', 'dev', '--workspace=apps/web'],
      },
    ],
  );
  const [api, worker, web] = children;
  assert.equal(api?.env.DATABASE_URL, target.databaseUrl);
  assert.equal(api?.env.PORT, '4000');
  assert.equal(api?.env.WEB_ORIGIN, 'http://127.0.0.1:3000');
  assert.equal(api?.env.CORS_ORIGINS, 'http://127.0.0.1:3000');
  assert.equal(api?.env.MCP_SDK_GENERATION, 'v2');
  assert.equal(api?.env.MCP_PROTOCOL_NEGOTIATION, 'auto');
  assert.equal(api?.env.NEXT_PUBLIC_API_URL, undefined);
  assert.equal(worker?.env.DATABASE_URL, target.databaseUrl);
  assert.equal(worker?.env.OPERATION_RUNTIME_WORKER_ENABLED, '1');
  assert.equal(worker?.env.PORT, undefined);
  assert.equal(worker?.env.WEB_ORIGIN, undefined);
  assert.equal(worker?.env.MCP_SDK_GENERATION, undefined);
  assert.equal(worker?.env.MCP_PROTOCOL_NEGOTIATION, undefined);
  assert.equal(web?.env.DATABASE_URL, target.databaseUrl);
  assert.equal(web?.env.PORT, '3000');
  assert.equal(web?.env.NEXT_PUBLIC_API_URL, 'http://127.0.0.1:4000');
  assert.equal(web?.env.MCP_SDK_GENERATION, undefined);
  assert.equal(web?.env.MCP_PROTOCOL_NEGOTIATION, undefined);
  for (const child of children) {
    assert.equal(child.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION, undefined);
  }
});

test('builds a disposable legacy fixture with sample rows for all six retired tables', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.createLegacyFixtureStatements, 'function');
  if (typeof helper.createLegacyFixtureStatements !== 'function') return;

  const statements = helper.createLegacyFixtureStatements();
  const source = statements.join('\n');

  assert.equal(statements.length, helper.RETIRED_AGENT_OS_TABLES.length * 2);
  for (const table of helper.RETIRED_AGENT_OS_TABLES) {
    assert.match(source, new RegExp(`CREATE TABLE "${table}"`));
    assert.match(source, new RegExp(`INSERT INTO "${table}"`));
  }
});

test('uses the built-in interactive browser-QA seed command instead of an ambient seed-command environment value', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.createBrowserQaSeedCommand, 'function');
  assert.equal(typeof helper.assertBrowserQaInteractiveStdin, 'function');
  assert.equal(typeof helper.createBrowserQaSeedEnvironment, 'function');
  if (
    typeof helper.createBrowserQaSeedCommand !== 'function'
    || typeof helper.assertBrowserQaInteractiveStdin !== 'function'
    || typeof helper.createBrowserQaSeedEnvironment !== 'function'
  ) return;

  assert.deepEqual(helper.createBrowserQaSeedCommand(), {
    command: 'npm',
    args: [
      'run',
      'seed:agent-os:browser-qa',
      '--',
      '--profile',
      'runtime.general-chat.v1',
    ],
  });
  assert.deepEqual(helper.createBrowserQaSeedCommand({ email: 'browser.qa@example.test' }), {
    command: 'npm',
    args: [
      'run',
      'seed:agent-os:browser-qa',
      '--',
      '--profile',
      'runtime.general-chat.v1',
      '--email',
      'browser.qa@example.test',
    ],
  });
  assert.doesNotThrow(() => helper.assertBrowserQaInteractiveStdin({ isTTY: true }));
  assert.throws(
    () => helper.assertBrowserQaInteractiveStdin({ isTTY: false }),
    /interactive stdin/i,
  );

  const target = helper.assertIsolatedTestcontainerTarget(createIsolatedTarget(helper));
  const environment = helper.createBrowserQaSeedEnvironment(target.databaseUrl, target, {
    DATABASE_URL: 'postgresql://unsafe@localhost:5432/kiditem',
    KIDITEM_BROWSER_QA_SEED_TARGET: 'unsafe context',
    PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'must-not-leak',
  });
  assert.equal(environment.DATABASE_URL, target.databaseUrl);
  assert.equal(environment.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION, undefined);
  assert.deepEqual(JSON.parse(environment.KIDITEM_BROWSER_QA_SEED_TARGET), {
    databaseName: target.databaseName,
    host: target.host,
    mappedPort: target.mappedPort,
  });
});

test('serve-browser-qa refuses non-interactive stdin before starting the container', async () => {
  const helper = await loadHelper();
  assert.equal(typeof helper.runCleanCutover, 'function');
  if (typeof helper.runCleanCutover !== 'function') return;

  const { dependencies, events } = createRunDependencies(helper);
  dependencies.assertBrowserQaInteractiveStdin = () => {
    events.push('browser-qa:stdin:validate');
    throw new Error('browser-QA requires interactive stdin');
  };

  await assert.rejects(
    () => helper.runCleanCutover({
      args: ['--serve-browser-qa', '--email', 'browser.qa@example.test'],
      dependencies,
    }),
    /interactive stdin/i,
  );
  assert.deepEqual(events, ['browser-qa:stdin:validate']);
});

test('CLI blocks force-reset before loading a runtime dependency or touching Docker', () => {
  const result = spawnSync(process.execPath, [helperPath, '--force-reset'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://developer:password@localhost:5432/kiditem',
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /force-reset.*blocked/i);
  assert.doesNotMatch(output, /testcontainers|Cannot find package/i);
});
