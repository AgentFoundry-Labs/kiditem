import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IsolatedCliNativeHandle } from '../isolated-cli-runtime.adapter';
import { LocalIsolatedCliTransport } from '../local-isolated-cli.transport';
import { verifyOfficialSourcingTerminalOutput } from '../../../../application/service/official-sourcing-terminal-output';

const started = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  executionId: '33333333-3333-4333-8333-333333333333',
  attemptId: '44444444-4444-4444-8444-444444444444',
  startIntentId: '55555555-5555-4555-8555-555555555555',
};

const ownedRoots: string[] = [];
const leftoverProcessGroups = new Set<number>();

afterEach(async () => {
  for (const pid of leftoverProcessGroups) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // The owned test process group already exited.
    }
  }
  leftoverProcessGroups.clear();
  await Promise.all(ownedRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

async function rootAndWork() {
  const root = await mkdtemp(join(tmpdir(), 'kiditem-local-cli-'));
  ownedRoots.push(root);
  const work = join(root, started.executionId, started.attemptId, 'work');
  const state = join(root, started.executionId, started.attemptId, 'state');
  await Promise.all([
    mkdir(work, { recursive: true }),
    mkdir(state, { recursive: true }),
  ]);
  return { root, work };
}

function environment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function native(
  processHandle: { nativeSessionId: string; pid: number; processStartIdentity: string },
  intent = started,
): IsolatedCliNativeHandle {
  return {
    ...processHandle,
    generation: 0,
    executableVersion: process.version,
    ...intent,
    runtimeCredentialGeneration: 0,
    modelIdentity: 'local-test-model',
    outputSchema: null,
    claudeMaxBudgetUsd: null,
    mcpToolSet: { schemaVersion: 1, servers: [] },
  };
}

describe('LocalIsolatedCliTransport', () => {
  it('preserves a Codex JSONL structured terminal answer exactly once for same-execution evidence verification', async () => {
    const { root, work } = await rootAndWork();
    const transport = new LocalIsolatedCliTransport(root);
    await transport.superviseStartIntent(started);
    const answer = {
      text: 'Evidence supports the collection run.',
      citationIds: ['evidence-1'],
      dataGaps: [],
      resourceRefs: [{ kind: 'operation_run', id: '00000000-0000-4000-8000-000000000007' }],
      operationRunId: '00000000-0000-4000-8000-000000000007',
    };
    const handle = await transport.start({
      binary: process.execPath,
      args: ['-e', [
        `process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'codex-jsonl'})+'\\n')`,
        `process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'human-readable progress'}})+'\\n')`,
        `process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n')`,
        `process.stdout.write(JSON.stringify({type:'result',result:${JSON.stringify(JSON.stringify(answer))}})+'\\n')`,
        'setTimeout(() => process.exit(0), 100)',
      ].join(';')],
      cwd: work,
      env: environment(),
      prompt: '',
      startIntent: started,
    });
    leftoverProcessGroups.add(handle.pid);

    const events = [];
    for await (const event of transport.connect(native(handle), {
      binary: process.execPath, args: ['-e', 'process.exit(9)'], cwd: work, env: environment(),
    })) events.push(event);
    const terminal = events.filter((event) => event.kind === 'terminal');
    expect(terminal).toEqual([{ kind: 'terminal', status: 'completed', output: answer }]);
    expect(verifyOfficialSourcingTerminalOutput({
      output: terminal[0]?.kind === 'terminal' ? terminal[0].output : null,
      organizationId: started.organizationId,
      evidence: [{
        schemaVersion: 1,
        capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
        outputSummary: { citationIds: ['evidence-1'] },
        resourceType: 'sourcing_workspace_evidence', resourceId: 'query-1',
      }, {
        schemaVersion: 1,
        capabilityKey: 'sourcing.refreshCollection',
        outputSummary: {
          operation: `organizations/${started.organizationId}/operations/00000000-0000-4000-8000-000000000007`,
        },
        resourceType: 'operation_run',
        resourceId: `organizations/${started.organizationId}/operations/00000000-0000-4000-8000-000000000007`,
      }],
    })).toMatchObject({ schemaVersion: 'sourcing-agent-answer.v1', citationIds: ['evidence-1'] });
    leftoverProcessGroups.delete(handle.pid);
  });

  it('does not recreate a local runtime stream for a live process owned by another transport', async () => {
    const { root, work } = await rootAndWork();
    const first = new LocalIsolatedCliTransport(root);
    await first.superviseStartIntent(started);
    const handle = await first.start({
      binary: process.execPath,
      args: ['-e', [
        `process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'native-live'})+'\\n')`,
        `setTimeout(()=>{process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}})+'\\n');process.exit(0)},250)`,
      ].join(';')],
      cwd: work,
      env: environment(),
      prompt: '',
      startIntent: started,
    });
    leftoverProcessGroups.add(handle.pid);

    const recreated = new LocalIsolatedCliTransport(root);
    const events = [];
    for await (const event of recreated.connect(native(handle), {
      binary: process.execPath,
      args: ['-e', 'process.exit(9)'],
      cwd: work,
      env: environment(),
    })) events.push(event);

    expect(events).toEqual([{
      kind: 'terminal',
      status: 'failed',
      errorCode: 'process_interrupted',
    }]);
    await waitUntil(async () => !(await processExists(handle.pid)));
    leftoverProcessGroups.delete(handle.pid);
  });

  it('terminalizes a verified-dead persisted handle instead of resuming the same attempt', async () => {
    const { root, work } = await rootAndWork();
    const stateDirectory = join(root, started.executionId, started.attemptId, 'state');
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(join(stateDirectory, 'transport.json'), JSON.stringify({
      status: 'running',
      pid: 999_999,
      nativeSessionId: 'native-dead',
      output: null,
    }));
    const transport = new LocalIsolatedCliTransport(root);
    const handle = native({
      nativeSessionId: 'native-dead',
      pid: 999_999,
      processStartIdentity: 'already-dead',
    });

    await expect(transport.inspect(handle)).resolves.toEqual({ status: 'unknown' });
    const events = [];
    for await (const event of transport.connect(handle, {
      binary: process.execPath,
      args: ['-e', `process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"resumed":true}'}})+'\\n')`],
      cwd: work,
      env: environment(),
    })) events.push(event);

    expect(events).toEqual([{
      kind: 'terminal',
      status: 'failed',
      errorCode: 'process_interrupted',
    }]);
  });

  it('preserves cancelled and terminates the exact process group including descendants', async () => {
    const { root, work } = await rootAndWork();
    const descendantPath = join(root, 'descendant.pid');
    const transport = new LocalIsolatedCliTransport(root);
    await transport.superviseStartIntent(started);
    const script = [
      `const {spawn}=require('node:child_process')`,
      `const {writeFileSync}=require('node:fs')`,
      `const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})`,
      `writeFileSync(${JSON.stringify(descendantPath)},String(child.pid))`,
      `process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'native-cancel'})+'\\n')`,
      `setInterval(()=>{},1000)`,
    ].join(';');
    const handle = await transport.start({
      binary: process.execPath,
      args: ['-e', script],
      cwd: work,
      env: environment(),
      prompt: '',
      startIntent: started,
    });
    leftoverProcessGroups.add(handle.pid);
    await waitUntil(async () => {
      try {
        return Number(await readFile(descendantPath, 'utf8')) > 0;
      } catch {
        return false;
      }
    });
    const descendantPid = Number(await readFile(descendantPath, 'utf8'));

    await transport.cancel(native(handle));
    await transport.cancel(native(handle));

    await expect(transport.inspect(native(handle))).resolves.toEqual({
      status: 'cancelled',
    });
    expect(await processExists(handle.pid)).toBe(false);
    expect(await processExists(descendantPid)).toBe(false);
    leftoverProcessGroups.delete(handle.pid);
  });

  it('treats transient process-group EPERM as alive until the persisted group exits', async () => {
    const { root } = await rootAndWork();
    const statePath = join(root, started.executionId, started.attemptId, 'state', 'transport.json');
    await writeFile(statePath, JSON.stringify({
      status: 'running', pid: 12_345, processStartIdentity: 'identity', nativeSessionId: 'ephemeral', output: null,
    }));
    const transport = new LocalIsolatedCliTransport(root);
    (transport as never as { readProcessStartIdentity: () => Promise<string | null> }).readProcessStartIdentity = async () => 'identity';
    let probes = 0;
    const kill = vi.spyOn(process, 'kill').mockImplementation(((_pid: number, signal?: number | NodeJS.Signals) => {
      if (signal === 0) {
        probes += 1;
        if (probes > 1) {
          const error = Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
          throw error;
        }
        const error = Object.assign(new Error('EPERM'), { code: 'EPERM' });
        throw error;
      }
      return true;
    }) as typeof process.kill);
    try {
      await transport.cancelStartIntent(started);
    } finally {
      kill.mockRestore();
    }
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toMatchObject({ status: 'cancelled' });
  });

  it('maps persistent process-group EPERM to the stable cancellation error without signalling a recycled PID', async () => {
    const { root } = await rootAndWork();
    const statePath = join(root, started.executionId, started.attemptId, 'state', 'transport.json');
    await writeFile(statePath, JSON.stringify({
      status: 'running', pid: 12_346, processStartIdentity: 'identity', nativeSessionId: 'ephemeral', output: null,
    }));
    const transport = new LocalIsolatedCliTransport(root);
    (transport as never as { readProcessStartIdentity: () => Promise<string | null> }).readProcessStartIdentity = async () => 'identity';
    const kill = vi.spyOn(process, 'kill').mockImplementation((() => {
      const error = Object.assign(new Error('EPERM'), { code: 'EPERM' });
      throw error;
    }) as typeof process.kill);
    try {
      await expect(transport.cancelStartIntent(started)).rejects.toThrow(
        'CLI_RUNTIME_PROCESS_GROUP_TERMINATION_UNCONFIRMED',
      );
    } finally {
      kill.mockRestore();
    }
  });

  it('persists runtime_starting before native discovery and a recreated deletion kills its exact descendant group', async () => {
    const { root, work } = await rootAndWork();
    const descendantPath = join(root, 'starting-descendant.pid');
    const first = new LocalIsolatedCliTransport(root);
    await first.superviseStartIntent(started);
    const starting = first.start({
      binary: process.execPath,
      args: ['-e', [
        `const {spawn}=require('node:child_process')`,
        `const {writeFileSync}=require('node:fs')`,
        `const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})`,
        `writeFileSync(${JSON.stringify(descendantPath)},String(child.pid))`,
        `setInterval(()=>{},1000)`,
      ].join(';')],
      cwd: work, env: environment(), prompt: '', startIntent: started,
    });
    const startingOutcome = starting.then(
      () => null,
      (error: unknown) => error,
    );
    await waitUntil(async () => {
      try {
        const state = JSON.parse(await readFile(join(root, started.executionId, started.attemptId, 'state', 'transport.json'), 'utf8'));
        return state.status === 'runtime_starting' && state.nativeSessionId === null && Number(await readFile(descendantPath, 'utf8')) > 0;
      } catch { return false; }
    });
    const descendantPid = Number(await readFile(descendantPath, 'utf8'));
    const recreated = new LocalIsolatedCliTransport(root);
    await expect(recreated.inspectStartIntent(started)).resolves.toEqual({ status: 'unknown' });
    await recreated.cancelStartIntent(started);
    await expect(startingOutcome).resolves.toMatchObject({ message: 'CLI_RUNTIME_NATIVE_SESSION_ID_MISSING' });
    expect(await processExists(descendantPid)).toBe(false);
  });

  it('survives a real detached supervisor owner kill after its durable PID barrier and leaves no descendant group', async () => {
    const { root, work } = await rootAndWork();
    const descendantPath = join(root, 'owner-kill-descendant.pid');
    const transport = new LocalIsolatedCliTransport(root);
    await transport.superviseStartIntent(started);
    const start = transport.start({
      binary: process.execPath,
      args: ['-e', [
        `const {spawn}=require('node:child_process')`,
        `const {writeFileSync}=require('node:fs')`,
        `const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})`,
        `writeFileSync(${JSON.stringify(descendantPath)},String(child.pid))`,
        `setInterval(()=>{},1000)`,
      ].join(';')],
      cwd: work, env: environment(), prompt: '', startIntent: started,
    });
    const outcome = start.then(() => null, (error: unknown) => error);
    const statePath = join(root, started.executionId, started.attemptId, 'state', 'transport.json');
    await waitUntil(async () => {
      try {
        const state = JSON.parse(await readFile(statePath, 'utf8'));
        return state.status === 'runtime_starting' && state.pid > 0 && Number(await readFile(descendantPath, 'utf8')) > 0;
      } catch { return false; }
    });
    const ownerPid = JSON.parse(await readFile(statePath, 'utf8')).pid as number;
    const descendantPid = Number(await readFile(descendantPath, 'utf8'));
    process.kill(-ownerPid, 'SIGKILL');
    await waitUntil(async () => !(await processExists(descendantPid)));
    const recreated = new LocalIsolatedCliTransport(root);
    await expect(recreated.inspectStartIntent(started)).resolves.toEqual({ status: 'unknown' });
    await expect(outcome).resolves.toMatchObject({ message: 'CLI_RUNTIME_NATIVE_SESSION_ID_MISSING' });
  });

  it('kills the exact group when native session discovery or process identity fails before a handle exists', async () => {
    const { root, work } = await rootAndWork();
    const transport = new LocalIsolatedCliTransport(root);
    await transport.superviseStartIntent(started);
    (transport as never as { readProcessStartIdentity: () => Promise<string | null> }).readProcessStartIdentity = async () => null;
    await expect(transport.start({
      binary: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: work,
      env: environment(), prompt: '', startIntent: started,
    })).rejects.toThrow('CLI_RUNTIME_PROCESS_IDENTITY_UNAVAILABLE');
    const state = JSON.parse(await readFile(join(root, started.executionId, started.attemptId, 'state', 'transport.json'), 'utf8'));
    expect(state.status).toBe('failed');
  });

  it('fails closed for a recreated missing or partial launch state until never-started or exited is positively proven', async () => {
    const { root } = await rootAndWork();
    const transport = new LocalIsolatedCliTransport(root);
    await expect(transport.inspectStartIntent(started)).resolves.toEqual({ status: 'unknown' });
    const statePath = join(root, started.executionId, started.attemptId, 'state', 'transport.json');
    await writeFile(statePath, JSON.stringify({ status: 'runtime_starting', pid: 0, nativeSessionId: null, output: null }));
    await expect(transport.inspectStartIntent(started)).resolves.toEqual({ status: 'unknown' });
  });

  it('never overwrites a fast native terminal state with running during start enrichment', async () => {
    const { root, work } = await rootAndWork();
    const transport = new LocalIsolatedCliTransport(root);
    await transport.superviseStartIntent(started);
    const handle = await transport.start({
      binary: process.execPath,
      args: ['-e', `process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'fast-terminal'})+String.fromCharCode(10));setTimeout(()=>process.exit(0),10)`],
      cwd: work, env: environment(), prompt: '', startIntent: started,
    });
    await waitUntil(async () => (await transport.inspect(native(handle))).status === 'completed');
    await expect(transport.inspect(native(handle))).resolves.toMatchObject({ status: 'completed' });
  });

  it('keeps a terminal write absorbing when a delayed runtime_starting write resumes', async () => {
    const { root, work } = await rootAndWork();
    const transport = new LocalIsolatedCliTransport(root);
    await transport.superviseStartIntent(started);
    const privateTransport = transport as never as {
      writeStatusAtomically(path: string, state: { status: string }): Promise<void>;
    };
    const write = privateTransport.writeStatusAtomically.bind(transport);
    let releaseStarting!: () => void;
    const startingBlocked = new Promise<void>((resolve) => { releaseStarting = resolve; });
    let startingEntered!: () => void;
    const entered = new Promise<void>((resolve) => { startingEntered = resolve; });
    privateTransport.writeStatusAtomically = async (path, state) => {
      if (state.status === 'runtime_starting') {
        startingEntered();
        await startingBlocked;
      }
      await write(path, state);
    };

    const starting = transport.start({
      binary: process.execPath,
      args: ['-e', `process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'barrier-terminal'})+String.fromCharCode(10));process.exit(0)`],
      cwd: work, env: environment(), prompt: '', startIntent: started,
    });
    await entered;
    await waitUntil(async () => {
      try {
        const state = JSON.parse(await readFile(join(root, started.executionId, started.attemptId, 'state', 'transport.json'), 'utf8'));
        return state.status === 'completed';
      } catch {
        return false;
      }
    });
    releaseStarting();
    const handle = await starting;
    await expect(transport.inspect(native(handle))).resolves.toEqual({
      status: 'completed', output: { text: '' },
    });
  });

  it.each(['completed', 'cancelled', 'failed'] as const)(
    'keeps %s terminal when a nonterminal write is released after its status read',
    async (terminalStatus) => {
      const { root } = await rootAndWork();
      let release!: () => void;
      const readBarrier = new Promise<void>((resolve) => { release = resolve; });
      let entered!: () => void;
      const readEntered = new Promise<void>((resolve) => { entered = resolve; });
      const transport = new LocalIsolatedCliTransport(root, {
        afterStatusRead: async () => {
          entered();
          await readBarrier;
        },
      });
      const statePath = join(root, started.executionId, started.attemptId, 'state', 'transport.json');
      const privateTransport = transport as never as {
        writeStatusAtomically(path: string, state: Record<string, unknown>): Promise<void>;
      };
      const lateNonterminal = privateTransport.writeStatusAtomically(statePath, {
        status: 'running', pid: 1, nativeSessionId: 'late-native', output: null,
      });
      await readEntered;
      await mkdir(join(root, started.executionId, started.attemptId, 'state'), { recursive: true });
      await writeFile(statePath, JSON.stringify({
        status: terminalStatus, pid: 1, nativeSessionId: 'terminal-native', output: null,
      }));
      release();
      await lateNonterminal;

      expect(JSON.parse(await readFile(statePath, 'utf8'))).toMatchObject({
        status: terminalStatus,
        nativeSessionId: 'terminal-native',
      });
    },
  );

  it('keeps repeated fast native terminal persistence monotonic after the supervisor writes session and exit together', async () => {
    const { root, work } = await rootAndWork();
    for (let index = 0; index < 3; index += 1) {
      const intent = { ...started, attemptId: `44444444-4444-4444-8444-44444444444${index}` };
      const attemptWork = join(root, intent.executionId, intent.attemptId, 'work');
      await mkdir(attemptWork, { recursive: true });
      const transport = new LocalIsolatedCliTransport(root);
      await transport.superviseStartIntent(intent);
      const handle = await transport.start({
        binary: process.execPath,
        args: ['-e', `process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'fast-${index}'})+String.fromCharCode(10));process.exit(0)`],
        cwd: attemptWork, env: environment(), prompt: '', startIntent: intent,
      });
      await waitUntil(async () => (await transport.inspect(native(handle, intent))).status === 'completed');
      await expect(transport.inspect(native(handle, intent))).resolves.toMatchObject({ status: 'completed' });
    }
  });
});

async function waitUntil(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('test process deadline exceeded');
}

async function processExists(pid: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const child = spawn('ps', ['-p', String(pid), '-o', 'pid=']);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.once('close', () => resolve(Boolean(output.trim())));
  });
}
