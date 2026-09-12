# Local Gateway Startup Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run dev:all` idempotently prepare macOS local files, ensure isolated Codex authentication, and only then start Core and the native Agent Gateway.

**Architecture:** Keep setup, provider authentication, and Gateway execution as independently runnable boundaries. A small built-in-only orchestration script runs setup and authentication sequentially, then dynamically loads `concurrently` after dependencies exist and owns the two long-running service commands.

**Tech Stack:** Node.js ESM scripts, npm workspaces, Vitest, Node test runner, bundled `@openai/codex`, `concurrently` 9.

## Global Constraints

- `.nvmrc` is a recommended reproducible baseline; setup accepts any Node `>=22 <23` release and never requires exact minor/patch equality.
- Provider commands use only the repository-bundled CLI and isolated `HOME`/`CODEX_HOME`; never read, copy, or print credential bytes.
- `setup:macos` remains deterministic and never starts provider authentication or a long-running service.
- `gateway:auth:codex` may start interactive login; `dev:gateway` performs only a non-interactive auth check.
- Setup or authentication failure must prevent all long-running services from starting.
- Docker startup, Prisma schema application, and local-user bootstrap remain explicit and outside `dev:all`.
- Preserve unrelated untracked files and existing local data.

---

### Task 1: Relax Node Patch Matching And Create The Isolated Codex Home

**Files:**
- Modify: `scripts/setup-macos-development.mjs`
- Test: `scripts/__tests__/setup-macos-development.spec.ts`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/runbooks/environment-variables.md`

**Interfaces:**
- Consumes: `RECOMMENDED_NODE_VERSION` and `macosGatewayPaths(home)`.
- Produces: `assertMacosDevelopmentRuntime({ platform, nodeVersion })` accepting Node major 22 and `setupMacosDevelopmentFiles(...)` creating `<loginRoot>/.codex` with mode `0700`.

- [x] **Step 1: Write the failing Node-range tests**

```ts
it.each(['22.0.0', '22.23.1', '22.23.2', '22.99.0'])(
  'accepts supported Node 22 version %s independently of the recommended patch',
  (nodeVersion) => {
    expect(() => assertMacosDevelopmentRuntime({ platform: 'darwin', nodeVersion }))
      .not.toThrow();
  },
);

it.each(['21.99.0', '23.0.0', 'invalid'])(
  'rejects unsupported Node version %s',
  (nodeVersion) => {
    expect(() => assertMacosDevelopmentRuntime({ platform: 'darwin', nodeVersion }))
      .toThrow('setup_node_version_mismatch');
  },
);
```

- [x] **Step 2: Run the focused test and observe the exact-patch guard fail**

Run: `npx vitest run --config scripts/vitest.config.ts scripts/__tests__/setup-macos-development.spec.ts`

Expected: FAIL for `22.0.0`, `22.23.1`, and `22.99.0` with `setup_node_version_mismatch`.

- [x] **Step 3: Implement major-only compatibility**

```js
const supportedNodeMajor = RECOMMENDED_NODE_VERSION.split('.')[0];
if (nodeVersion.split('.')[0] !== supportedNodeMajor) {
  throw new Error('setup_node_version_mismatch');
}
```

- [x] **Step 4: Write the failing protected Codex-home test**

```ts
const result = await setupMacosDevelopmentFiles({ repoRoot, home });
const codexHome = join(result.gateway.loginRoot, '.codex');
expect((await stat(codexHome)).isDirectory()).toBe(true);
expect((await stat(codexHome)).mode & 0o777).toBe(0o700);
```

- [x] **Step 5: Run the test and observe `ENOENT`, then create the directory**

```js
for (const directory of [
  gateway.root,
  dirname(gateway.tokenFile),
  gateway.stateRoot,
  gateway.loginRoot,
  join(gateway.loginRoot, '.codex'),
]) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}
```

Run: `npx vitest run --config scripts/vitest.config.ts scripts/__tests__/setup-macos-development.spec.ts`

Expected: 12 tests PASS.

---

### Task 2: Add Explicit Provider Authentication And Start Guards

**Files:**
- Modify: `scripts/local-agent-gateway.mjs`
- Test: `scripts/__tests__/local-agent-gateway.spec.ts`
- Modify: `package.json`
- Modify: `scripts/check-script-inventory.mjs`
- Test: `scripts/__tests__/check-script-inventory.test.mjs`
- Test: `scripts/__tests__/developer-onboarding-contract.test.mjs`

**Interfaces:**
- Consumes: `loadLocalGatewayConfig(configFile)`, bundled provider entrypoints, and isolated `loginRoot`.
- Produces: `buildProviderAuthStatusCommand(...)`, `ensureProviderAuthentication({ status, login, interactive })`, package command `gateway:auth:codex`, and a non-interactive Codex guard for `start`.

- [x] **Step 1: Write failing command and authentication-state tests**

```ts
const status = buildProviderAuthStatusCommand({
  provider: 'codex', config: fixture.config, platform: 'darwin',
  processExecPath: '/usr/local/bin/node',
  environment: { PATH: '/usr/bin', USER: 'developer' },
});
expect(status.args).toEqual([
  join(fixture.runtimeRoot, 'node_modules/@openai/codex/bin/codex.js'),
  'login',
  'status',
]);
expect(status.env.CODEX_HOME).toBe(join(fixture.loginRoot, '.codex'));

const events: string[] = [];
const result = ensureProviderAuthentication({
  status: () => { events.push('status'); return events.length > 2; },
  login: () => { events.push('login'); },
  interactive: true,
});
expect(result).toEqual({ loginStarted: true });
expect(events).toEqual(['status', 'login', 'status']);

const skipped: string[] = [];
expect(ensureProviderAuthentication({
  status: () => { skipped.push('status'); return true; },
  login: () => { skipped.push('login'); },
  interactive: true,
})).toEqual({ loginStarted: false });
expect(skipped).toEqual(['status']);

expect(() => ensureProviderAuthentication({
  status: () => false,
  login: () => { throw new Error('login_must_not_run'); },
  interactive: false,
})).toThrow('gateway_provider_unauthenticated');

expect(() => ensureProviderAuthentication({
  status: () => false,
  login: () => undefined,
  interactive: true,
})).toThrow('gateway_provider_auth_failed');
```

- [x] **Step 2: Run the focused test and verify missing exports fail**

Run: `npx vitest run --config scripts/vitest.config.ts scripts/__tests__/local-agent-gateway.spec.ts`

Expected: FAIL because `buildProviderAuthStatusCommand` and `ensureProviderAuthentication` are not exported.

- [x] **Step 3: Implement provider status and ensure-auth behavior**

```js
export function ensureProviderAuthentication({ status, login, interactive }) {
  if (status()) return Object.freeze({ loginStarted: false });
  if (!interactive) throw new Error('gateway_provider_unauthenticated');
  login();
  if (!status()) throw new Error('gateway_provider_auth_failed');
  return Object.freeze({ loginStarted: true });
}

export function buildProviderAuthStatusCommand(input) {
  const login = buildProviderLoginCommand(input);
  const argsPrefix = input.provider === 'codex'
    ? login.args.slice(0, -1)
    : login.args.slice(0, -2);
  return Object.freeze({
    ...login,
    args: Object.freeze(input.provider === 'codex'
      ? [...argsPrefix, 'login', 'status']
      : [...argsPrefix, 'auth', 'status', '--json']),
  });
}

function commandSucceeds(command) {
  const result = spawnSync(command.executable, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: 'ignore',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}
```

In `main`, build the status and login commands once. Map `auth codex` to
`ensureProviderAuthentication({ status: () => commandSucceeds(statusCommand),
login: () => run(loginCommand, 'gateway_provider_auth_failed'), interactive:
true })`. Before `start`, invoke the same function with `interactive: false`;
never open a browser from `start`.

- [x] **Step 4: Add package and inventory contracts**

```json
"gateway:auth:codex": "node scripts/local-agent-gateway.mjs auth codex"
```

Require that exact value from `check-script-inventory.mjs`, its fixture test,
and `developer-onboarding-contract.test.mjs`. Keep the existing forced
`gateway:login:codex` command.

- [x] **Step 5: Run focused and complete script tests**

Run: `npx vitest run --config scripts/vitest.config.ts scripts/__tests__/local-agent-gateway.spec.ts`

Expected: PASS.

Run: `npm run test:scripts`

Expected: all Vitest and Node script tests PASS.

- [x] **Step 6: Commit the provider-auth boundary**

```bash
git add package.json scripts/local-agent-gateway.mjs scripts/check-script-inventory.mjs scripts/__tests__/local-agent-gateway.spec.ts scripts/__tests__/check-script-inventory.test.mjs scripts/__tests__/developer-onboarding-contract.test.mjs
git commit -m "feat: add local gateway auth boundary"
```

---

### Task 3: Orchestrate Setup, Authentication, And Services

**Files:**
- Create: `scripts/run-local-development.mjs`
- Create: `scripts/__tests__/run-local-development.spec.ts`
- Modify: `package.json`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/README.md`
- Test: `scripts/__tests__/check-script-inventory.test.mjs`
- Test: `scripts/__tests__/developer-onboarding-contract.test.mjs`

**Interfaces:**
- Consumes: `setup-macos-development.mjs`, `local-agent-gateway.mjs auth codex`, `dev:core`, and `dev:gateway`.
- Produces: `orchestrateLocalDevelopment({ setup, authenticate, startServices })`, `startLocalServices({ concurrentlyImpl })`, and `dev:all` as the single local runtime entrypoint.

- [x] **Step 1: Write failing orchestration-order and short-circuit tests**

```ts
const events: string[] = [];
await orchestrateLocalDevelopment({
  setup: async () => { events.push('setup'); },
  authenticate: async () => { events.push('auth'); },
  startServices: async () => { events.push('services'); },
});
expect(events).toEqual(['setup', 'auth', 'services']);

const setupFailureEvents: string[] = [];
await expect(orchestrateLocalDevelopment({
  setup: async () => { setupFailureEvents.push('setup'); throw new Error('setup_failed'); },
  authenticate: async () => { setupFailureEvents.push('auth'); },
  startServices: async () => { setupFailureEvents.push('services'); },
})).rejects.toThrow('setup_failed');
expect(setupFailureEvents).toEqual(['setup']);

const authFailureEvents: string[] = [];
await expect(orchestrateLocalDevelopment({
  setup: async () => { authFailureEvents.push('setup'); },
  authenticate: async () => { authFailureEvents.push('auth'); throw new Error('auth_failed'); },
  startServices: async () => { authFailureEvents.push('services'); },
})).rejects.toThrow('auth_failed');
expect(authFailureEvents).toEqual(['setup', 'auth']);
```

- [x] **Step 2: Run the new focused test and verify the missing module fails**

Run: `npx vitest run --config scripts/vitest.config.ts scripts/__tests__/run-local-development.spec.ts`

Expected: FAIL because `run-local-development.mjs` does not exist.

- [x] **Step 3: Implement the built-in-only preflight orchestration**

```js
export async function orchestrateLocalDevelopment({ setup, authenticate, startServices }) {
  await setup();
  await authenticate();
  await startServices();
}

export function runStage({ executable, args, cwd, failureCode }) {
  const result = spawnSync(executable, args, { cwd, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(failureCode);
}
```

The main function resolves the repository root, runs setup with the current
`process.execPath`, runs `local-agent-gateway.mjs auth codex`, and only then
dynamically imports `concurrently`.

- [x] **Step 4: Implement service ownership with tested concurrently options**

```js
export async function startLocalServices({ concurrentlyImpl }) {
  const { result } = concurrentlyImpl([
    { command: 'npm run dev:core', name: 'core' },
    { command: 'npm run dev:gateway', name: 'gateway' },
  ], {
    prefix: 'name',
    prefixColors: ['cyan', 'magenta'],
    killOthersOn: ['failure', 'success'],
  });
  await result;
}
```

Test the exact command list and process policy:

```ts
let received: { commands: unknown; options: unknown } | undefined;
await startLocalServices({
  concurrentlyImpl: (commands, options) => {
    received = { commands, options };
    return { result: Promise.resolve([]) } as never;
  },
});
expect(received).toEqual({
  commands: [
    { command: 'npm run dev:core', name: 'core' },
    { command: 'npm run dev:gateway', name: 'gateway' },
  ],
  options: {
    prefix: 'name',
    prefixColors: ['cyan', 'magenta'],
    killOthersOn: ['failure', 'success'],
  },
});
```

`concurrently` retains its built-in SIGINT/SIGTERM handler so `Ctrl-C` closes
both process trees; the real smoke step verifies that integration.

- [x] **Step 5: Wire the package command and durable inventory**

```json
"dev:all": "node scripts/run-local-development.mjs"
```

Add `run-local-development.mjs` to `SCRIPT_INVENTORY`, document it in
`scripts/README.md`, and update both inventory/developer-onboarding tests to
require the exact command while continuing to exclude `dev:agents`.

- [x] **Step 6: Run orchestration and inventory tests**

Run: `npx vitest run --config scripts/vitest.config.ts scripts/__tests__/run-local-development.spec.ts scripts/__tests__/local-agent-gateway.spec.ts`

Expected: PASS.

Run: `npm run check:scripts-inventory && npm run test:scripts`

Expected: both commands PASS.

- [x] **Step 7: Commit orchestration**

```bash
git add package.json scripts/run-local-development.mjs scripts/__tests__/run-local-development.spec.ts scripts/check-script-inventory.mjs scripts/README.md scripts/__tests__/check-script-inventory.test.mjs scripts/__tests__/developer-onboarding-contract.test.mjs
git commit -m "feat: orchestrate local gateway startup"
```

---

### Task 4: Align Runbooks And Verify The Real Workflow

**Files:**
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/runbooks/environment-variables.md`
- Verify: `docs/superpowers/specs/archive/2026-08-29-macos-developer-onboarding-design.md`

**Interfaces:**
- Consumes: the final package commands and stable error codes from Tasks 1–3.
- Produces: operator documentation matching the automated first-run and repeat-run behavior.

- [x] **Step 1: Update the runbook command flow**

Document that `.nvmrc` is recommended, Node 22 is supported, setup creates
`.codex`, `gateway:auth:codex` checks/repairs authentication, `dev:gateway`
never opens login, and `dev:all` runs setup → auth → Core/Gateway. Retain the
explicit Docker, schema, and local-user steps.

- [x] **Step 2: Run all repository script gates**

Run: `npm run check:scripts-inventory`

Expected: `check:scripts-inventory PASS`.

Run: `npm run test:scripts`

Expected: all script tests PASS.

Run: `npm run check:conventions`

Expected: all convention guards PASS.

- [x] **Step 3: Verify builds required by the changed runtime path**

Run: `npm run build --workspace=apps/agent-gateway`

Expected: exit code 0 and `apps/agent-gateway/dist/main.cjs` present.

Run: `npm run build --workspace=apps/web`

Expected: exit code 0.

- [x] **Step 4: Verify setup under the installed non-exact Node patch**

Run: `node --version && npm run setup:macos -- --skip-install`

Expected: Node `22.23.1` is accepted, setup exits 0, and the isolated
`provider-home/.codex` exists with mode `0700`.

- [x] **Step 5: Verify provider authentication and automatic startup**

Run: `npm run gateway:auth:codex`

Expected: an existing isolated login exits immediately, or the browser/device
flow opens once and the command exits 0 after operator approval.

Run: `npm run dev:all`

Expected: setup and auth complete before Core/Gateway logs begin; Web listens on
3000, API on 4000, Gateway registers through outbound polling, and the Agent OS
readiness no longer reports `The provider Gateway is unavailable`.

Send `Ctrl-C` once.

Expected: Core and Gateway children terminate without orphan processes.

- [x] **Step 6: Commit documentation and verification contract**

```bash
git add docs/runbooks/local-development.md docs/runbooks/environment-variables.md scripts/setup-macos-development.mjs scripts/__tests__/setup-macos-development.spec.ts
git commit -m "docs: align automated local gateway setup"
```
