import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type {
  DurableRuntimeAdapterEvent,
  RuntimeInspection,
  RuntimeInterruptInput,
} from '../../../application/port/out/runtime/agent-durable-runtime.port';
import type {
  IsolatedCliNativeHandle,
  IsolatedCliProcessHandle,
  IsolatedCliStartIntent,
  IsolatedCliStartRequest,
  IsolatedCliTransport,
} from './isolated-cli-runtime.adapter';

const execFileAsync = promisify(execFile);

type PersistedStatus = {
  status: 'runtime_launching' | 'runtime_starting' | 'running' | 'completed' | 'cancelled' | 'failed';
  pid: number;
  processStartIdentity?: string;
  nativeSessionId: string | null;
  output: Record<string, unknown> | null;
  cancelRequested?: boolean;
};

type ActiveRun = {
  child: ChildProcessWithoutNullStreams;
  nativeSessionId: string;
  events: DurableRuntimeAdapterEvent[];
  waiters: Array<() => void>;
  done: boolean;
  outputText: string;
  terminalQueued: boolean;
  cancelRequested: boolean;
  finalResultText: string | null;
  statePath: string;
  startIntent: IsolatedCliStartIntent;
  finished: Promise<void>;
  resolveFinished: () => void;
};

export class LocalIsolatedCliTransport implements IsolatedCliTransport {
  private readonly active = new Map<string, ActiveRun>();
  private readonly pending = new Map<string, ActiveRun>();
  private readonly supervised = new Set<string>();
  private readonly sealed = new Set<string>();
  private readonly statusTransitions = new Map<string, Promise<void>>();

  constructor(
    private readonly runRoot: string,
    private readonly hooks?: { afterStatusRead?: (path: string) => Promise<void> | void },
  ) {}

  async probeVersion(binary: string): Promise<string> {
    const { stdout } = await execFileAsync(binary, ['--version'], {
      timeout: 5_000,
      maxBuffer: 1_024,
    });
    return stdout.trim();
  }

  async probeAuthentication(
    binary: string,
    env: Record<string, string>,
  ): Promise<void> {
    if (binary === 'claude') {
      const { stdout } = await execFileAsync(binary, ['auth', 'status', '--json'], {
        timeout: 5_000,
        maxBuffer: 4_096,
        env,
      });
      let status: unknown;
      try {
        status = JSON.parse(stdout);
      } catch {
        throw new Error('CLI_RUNTIME_UNAUTHENTICATED: claude_cli');
      }
      if (
        !status
        || typeof status !== 'object'
        || !('loggedIn' in status)
        || status.loggedIn !== true
      ) {
        throw new Error('CLI_RUNTIME_UNAUTHENTICATED: claude_cli');
      }
      return;
    }
    if (binary === 'codex') {
      const { stdout, stderr } = await execFileAsync(binary, ['login', 'status'], {
        timeout: 5_000,
        maxBuffer: 4_096,
        env,
      });
      if (!/logged in/i.test(`${stdout}\n${stderr}`)) {
        throw new Error('CLI_RUNTIME_UNAUTHENTICATED: codex_cli');
      }
      return;
    }
    throw new Error('CLI_RUNTIME_BINARY_NOT_ALLOWLISTED');
  }

  async start(request: IsolatedCliStartRequest): Promise<IsolatedCliProcessHandle> {
    const coordinate = intentKey(request.startIntent);
    if (!this.supervised.has(coordinate) || this.sealed.has(coordinate)) {
      throw new Error('CLI_RUNTIME_START_INTENT_REVOKED');
    }
    await this.persistLaunchMarker(request.startIntent);
    const suppliedSessionId = request.binary === 'claude' ? randomUUID() : null;
    const args = suppliedSessionId
      ? [...request.args, '--session-id', suppliedSessionId]
      : request.args;
    const run = this.spawnRun(
      request.binary,
      args,
      request.cwd,
      request.env,
      request.prompt,
      suppliedSessionId,
      request.startIntent,
    );
    this.pending.set(coordinate, run);
    this.supervised.delete(coordinate);
    const pid = run.child.pid;
    let processStartIdentity: string;
    try {
      if (!pid) throw new Error('CLI_RUNTIME_PROCESS_START_FAILED');
      processStartIdentity = await this.requireProcessStartIdentity(pid);
      await this.persist(run, { status: 'runtime_starting', pid, processStartIdentity, nativeSessionId: null, output: null });
    } catch (error) {
      await this.failPreHandle(run, error);
      throw error;
    }
    let nativeSessionId: string;
    try {
      nativeSessionId = suppliedSessionId ?? await this.waitForSessionId(run);
      run.nativeSessionId = nativeSessionId;
      // finish() persists its terminal state before setting done. Never let a
      // late native-session enrichment regress that durable terminal outcome.
      if (run.done) {
        this.pending.delete(coordinate);
        return { nativeSessionId, pid, processStartIdentity, generation: 0 };
      }
    } catch (error) {
      await this.failPreHandle(run, error);
      throw error;
    }
    this.active.set(nativeSessionId, run);
    this.pending.delete(coordinate);
    return {
      nativeSessionId,
      pid,
      processStartIdentity,
      generation: 0,
    };
  }

  async *connect(
    handle: IsolatedCliNativeHandle,
    _resume: { binary: string; args: string[]; cwd: string; env: Record<string, string> },
  ): AsyncIterable<DurableRuntimeAdapterEvent> {
    let run = this.active.get(handle.nativeSessionId);
    if (!run) {
      const persisted = await this.readStatus(handle.executionId, handle.attemptId);
      const terminal = terminalEvent(persisted);
      if (terminal) {
        yield terminal;
        return;
      }
      // A native CLI session is a current-process resource.  Recreating this
      // transport may observe an already-owned child until it terminates, but
      // it must never spawn `codex resume`/`claude --resume` for the same
      // immutable execution attempt.  Bootstrap recovery terminalizes that
      // exact DB attempt; any future work receives a fresh coordinate.
      yield {
        kind: 'terminal',
        status: 'failed',
        errorCode: 'process_interrupted',
      };
      return;
    }
    let index = 0;
    while (true) {
      while (index < run.events.length) yield run.events[index++]!;
      if (run.done) return;
      await new Promise<void>((resolve) => run!.waiters.push(resolve));
    }
  }

  async inspect(handle: IsolatedCliNativeHandle): Promise<RuntimeInspection> {
    const active = this.active.get(handle.nativeSessionId);
    if (active && !active.done) return { status: 'running' };
    const state = await this.readStatus(handle.executionId, handle.attemptId);
    if (!state) return { status: 'unknown' };
    if (state.status === 'completed') return { status: 'completed', output: state.output ?? {} };
    if (state.status === 'cancelled') return { status: 'cancelled' };
    if (state.status === 'failed' || state.status === 'runtime_launching' || state.status === 'runtime_starting') return { status: 'unknown' };
    // Native sessions cannot survive a Nest process restart.  The durable DB
    // attempt will be closed by startup recovery rather than resumed here.
    return { status: 'unknown' };
  }

  async interrupt(handle: IsolatedCliNativeHandle, _input: RuntimeInterruptInput): Promise<void> {
    const pid = this.active.get(handle.nativeSessionId)?.child.pid;
    if (pid) this.signalProcessGroup(pid, 'SIGINT');
  }

  async cancel(handle: IsolatedCliNativeHandle): Promise<void> {
    await this.cancelCoordinate(handle.executionId, handle.attemptId);
  }

  async readProcessStartIdentity(pid: number): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('ps', ['-o', 'lstart=', '-p', String(pid)], {
        timeout: 2_000,
        maxBuffer: 1_024,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async superviseStartIntent(input: IsolatedCliStartIntent): Promise<void> {
    const coordinate = intentKey(input);
    if (this.sealed.has(coordinate)) {
      throw new Error('CLI_RUNTIME_START_INTENT_REVOKED');
    }
    try {
      await readFile(this.revokedPath(input), 'utf8');
      throw new Error('CLI_RUNTIME_START_INTENT_REVOKED');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.supervised.add(coordinate);
  }

  async inspectStartIntent(input: IsolatedCliStartIntent): Promise<RuntimeInspection> {
    const pending = this.pending.get(intentKey(input));
    if (pending && !pending.done) return { status: 'running' };
    const state = await this.readStatus(input.executionId, input.attemptId);
    if (!state) return { status: 'unknown' };
    if (state.status === 'completed') return { status: 'completed', output: state.output ?? {} };
    if (state.status === 'cancelled' || state.status === 'failed') return { status: 'cancelled' };
    if ((state.status === 'runtime_launching' || state.status === 'runtime_starting') && state.nativeSessionId === null) {
      return await this.persistedProcessGroupIsAlive(state)
        ? { status: 'unknown' }
        : { status: 'unknown' };
    }
    return await this.persistedProcessIsAlive(state) ? { status: 'running' } : { status: 'cancelled' };
  }

  async cancelStartIntent(input: IsolatedCliStartIntent): Promise<void> {
    this.sealed.add(intentKey(input));
    await this.cancelCoordinate(input.executionId, input.attemptId);
  }

  async revokeStartIntent(input: IsolatedCliStartIntent): Promise<void> {
    this.sealed.add(intentKey(input));
    this.supervised.delete(intentKey(input));
    const path = this.revokedPath(input);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, input.startIntentId, { encoding: 'utf8', mode: 0o600 });
  }

  private spawnRun(
    binary: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    prompt: string,
    nativeSessionId: string | null,
    startIntent: IsolatedCliStartIntent,
  ): ActiveRun {
    const child = spawn(binary, args, {
      cwd,
      env,
      shell: false,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let resolveFinished!: () => void;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const run: ActiveRun = {
      child,
      nativeSessionId: nativeSessionId ?? '',
      events: [],
      waiters: [],
      done: false,
      outputText: '',
      terminalQueued: false,
      cancelRequested: false,
      finalResultText: null,
      statePath: join(dirname(cwd), 'state', 'transport.json'),
      startIntent,
      finished,
      resolveFinished,
    };
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) this.consumeLine(run, line);
    });
    child.stderr.resume();
    child.once('error', () => this.finish(run, 1));
    child.once('close', (code) => { if (buffer.trim()) this.consumeLine(run, buffer); void this.finish(run, code ?? 1); });
    child.stdin.end(prompt);
    return run;
  }

  private consumeLine(run: ActiveRun, line: string): void {
    if (!line.trim()) return;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const sessionId = extractSessionId(value);
    if (sessionId && !run.nativeSessionId) run.nativeSessionId = sessionId;
    const finalResult = extractFinalResult(value);
    if (finalResult !== null) run.finalResultText = finalResult;
    const text = extractText(value);
    if (text) {
      if (!run.outputText) this.push(run, { kind: 'text_start' });
      run.outputText += text;
      this.push(run, { kind: 'text_delta', content: text });
    }
  }

  private async finish(run: ActiveRun, code: number): Promise<void> {
    if (run.done) return;
    const persisted = await this.readStatus(run.startIntent.executionId, run.startIntent.attemptId).catch(() => null);
    const durableTerminal = terminalEvent(persisted);
    if (durableTerminal) {
      this.pending.delete(intentKey(run.startIntent));
      this.active.delete(run.nativeSessionId);
      run.done = true;
      this.wake(run);
      run.resolveFinished();
      return;
    }
    const cancelled = run.cancelRequested;
    const completed = !cancelled && code === 0;
    const output = completed
      ? parseOutput(run.finalResultText ?? run.outputText)
      : null;
    const pid = run.child.pid ?? 0;
    if (run.nativeSessionId) {
      await this.persist(run, {
        status: cancelled ? 'cancelled' : completed ? 'completed' : 'failed',
        pid,
        processStartIdentity:
          pid > 0 ? await this.readProcessStartIdentity(pid) ?? undefined : undefined,
        nativeSessionId: run.nativeSessionId,
        output,
      }).catch(() => undefined);
      this.active.delete(run.nativeSessionId);
    }
    this.pending.delete(intentKey(run.startIntent));
    if (run.outputText) this.push(run, { kind: 'text_end' });
    if (!run.terminalQueued) {
      run.terminalQueued = true;
      this.push(
        run,
        cancelled
          ? { kind: 'terminal', status: 'cancelled' }
          : completed
            ? { kind: 'terminal', status: 'completed', output: output ?? {} }
            : {
                kind: 'terminal',
                status: 'failed',
                errorCode: 'CLI_RUNTIME_EXIT_FAILED',
              },
      );
    }
    run.done = true;
    this.wake(run);
    run.resolveFinished();
  }

  private push(run: ActiveRun, event: DurableRuntimeAdapterEvent): void {
    run.events.push(event);
    this.wake(run);
  }

  private wake(run: ActiveRun): void {
    for (const waiter of run.waiters.splice(0)) waiter();
  }

  private async waitForSessionId(run: ActiveRun): Promise<string> {
    const deadline = Date.now() + 10_000;
    while (!run.nativeSessionId && Date.now() < deadline) {
      const persisted = await this.readStatus(run.startIntent.executionId, run.startIntent.attemptId);
      if (persisted?.nativeSessionId) {
        run.nativeSessionId = persisted.nativeSessionId;
        return run.nativeSessionId;
      }
      if (run.done) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 50);
        timer.unref?.();
      });
    }
    if (!run.nativeSessionId) {
      throw new Error('CLI_RUNTIME_NATIVE_SESSION_ID_MISSING');
    }
    return run.nativeSessionId;
  }

  private async cancelCoordinate(executionId: string, attemptId: string): Promise<void> {
    const pending = [...this.pending.values()].find((run) =>
      run.startIntent.executionId === executionId
      && run.startIntent.attemptId === attemptId,
    );
    if (pending) {
      pending.cancelRequested = true;
      await this.terminateRun(pending);
      return;
    }
    const state = await this.readStatus(executionId, attemptId);
    if (!state) return;
    const active = (state.nativeSessionId ? this.active.get(state.nativeSessionId) : undefined)
      ?? [...this.active.values()].find((run) =>
        run.startIntent.executionId === executionId
        && run.startIntent.attemptId === attemptId,
      );
    if (active) {
      active.cancelRequested = true;
      await this.persist(active, {
        ...state,
        cancelRequested: true,
      });
      await this.terminateRun(active);
      return;
    }
    await this.writeStatusAtomically(
      this.statusPath(executionId, attemptId),
      { ...state, cancelRequested: true },
    );
    await this.terminatePersistedProcess(state);
    await this.writeStatusAtomically(
      this.statusPath(executionId, attemptId),
      { ...state, status: 'cancelled', cancelRequested: true },
    );
  }

  private async terminateRun(run: ActiveRun): Promise<void> {
    const pid = run.child.pid;
    if (!pid) throw new Error('CLI_RUNTIME_CANCEL_UNCONFIRMED');
    this.signalProcessGroup(pid, 'SIGTERM');
    if (await settlesWithin(run.finished, 2_000) && !(await this.processGroupIsAlive(pid))) return;
    this.signalProcessGroup(pid, 'SIGKILL');
    if (!(await settlesWithin(run.finished, 2_000)) || await this.processGroupIsAlive(pid)) {
      throw new Error('CLI_RUNTIME_CANCEL_UNCONFIRMED');
    }
  }

  private async terminatePersistedProcess(state: PersistedStatus): Promise<void> {
    // Never signal a recycled PID. The persisted identity is the fence for a
    // detached process group that no longer has an in-memory owner.
    if (!(await this.persistedProcessIsAlive(state))) return;
    if (!(await this.persistedProcessGroupIsAlive(state))) return;
    this.signalProcessGroup(state.pid, 'SIGTERM');
    if (await this.processGroupExitsWithin(state, 2_000)) return;
    this.signalProcessGroup(state.pid, 'SIGKILL');
    if (!(await this.processGroupExitsWithin(state, 2_000))) {
      throw new Error('CLI_RUNTIME_CANCEL_UNCONFIRMED');
    }
  }

  private signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') return;
      if (code === 'EPERM') {
        throw new Error('CLI_RUNTIME_PROCESS_GROUP_TERMINATION_UNCONFIRMED');
      }
      throw error;
    }
  }

  private async persistedProcessIsAlive(
    state: PersistedStatus,
    original?: IsolatedCliNativeHandle,
  ): Promise<boolean> {
    if (state.pid <= 0) return false;
    const identity = await this.readProcessStartIdentity(state.pid);
    if (!identity) return false;
    const expected = state.processStartIdentity
      ?? (original?.pid === state.pid ? original.processStartIdentity : null);
    return expected === null || identity === expected;
  }

  private async persistedProcessGroupIsAlive(state: PersistedStatus): Promise<boolean> {
    if (state.pid <= 0) return false;
    return this.processGroupIsAlive(state.pid);
  }

  private processGroupIsAlive(pid: number): boolean {
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      // EPERM means the group still exists but cannot yet be inspected by this
      // process. Keep waiting; a persistent error becomes the stable terminal
      // cancellation error rather than leaking a platform errno.
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return true;
      throw error;
    }
  }

  private async processExitsWithin(
    state: PersistedStatus,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!(await this.persistedProcessIsAlive(state))) return true;
      await delay(25);
    }
    return !(await this.persistedProcessIsAlive(state));
  }

  private async processGroupExitsWithin(state: PersistedStatus, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!(await this.persistedProcessGroupIsAlive(state))) return true;
      await delay(25);
    }
    return !(await this.persistedProcessGroupIsAlive(state));
  }

  private async requireProcessStartIdentity(pid: number): Promise<string> {
    const identity = await this.readProcessStartIdentity(pid);
    if (!identity) throw new Error('CLI_RUNTIME_PROCESS_IDENTITY_UNAVAILABLE');
    return identity;
  }

  private async failPreHandle(run: ActiveRun, cause: unknown): Promise<void> {
    const pid = run.child.pid;
    let terminated = false;
    if (pid) {
      try {
        await this.terminateRun(run);
        terminated = true;
      } catch {
        // Persist the failure below; a later deletion/recovery sees the exact
        // starting coordinate rather than claiming a clean cancellation.
      }
    }
    const identity = pid ? await this.readProcessStartIdentity(pid) ?? undefined : undefined;
    await this.persist(run, {
      status: 'failed', pid: pid ?? 0, processStartIdentity: identity,
      nativeSessionId: run.nativeSessionId || null, output: null,
    }).catch(() => undefined);
    this.pending.delete(intentKey(run.startIntent));
    if (!terminated) throw new Error(`CLI_RUNTIME_PREHANDLE_CLEANUP_UNCONFIRMED: ${String(cause)}`);
  }

  private async persist(run: ActiveRun, state: PersistedStatus): Promise<void> {
    const current = await this.readStatus(
      run.startIntent.executionId,
      run.startIntent.attemptId,
    );
    // Completion is absorbing for an immutable attempt. A delayed launch or
    // native-handle enrichment must not turn a terminal local record back
    // into `runtime_starting`/`running`.
    if (current && isTerminalStatus(current.status)) return;
    await this.writeStatusAtomically(run.statePath, state);
  }

  private async readStatus(executionId: string, attemptId: string): Promise<PersistedStatus | null> {
    try {
      return JSON.parse(await readFile(this.statusPath(executionId, attemptId), 'utf8')) as PersistedStatus;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }


  private statusPath(executionId: string, attemptId: string): string {
    return join(this.runRoot, executionId, attemptId, 'state', 'transport.json');
  }


  private async writeStatusAtomically(path: string, state: PersistedStatus): Promise<void> {
    await this.serializeStatusTransition(path, async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      try {
        const current = JSON.parse(await readFile(path, 'utf8')) as PersistedStatus;
        if (isTerminalStatus(current.status)) return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await this.hooks?.afterStatusRead?.(path);
      // A child/process lifecycle can terminalize the same persisted attempt
      // while this writer is paused after its initial read. Re-read under the
      // coordinate lock so nonterminal launch/enrichment never resurrects it.
      try {
        const latest = JSON.parse(await readFile(path, 'utf8')) as PersistedStatus;
        if (isTerminalStatus(latest.status)) return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, path);
    });
  }

  private async serializeStatusTransition<T>(
    path: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const prior = this.statusTransitions.get(path) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.statusTransitions.set(path, current);
    await prior;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private persistLaunchMarker(startIntent: IsolatedCliStartIntent): Promise<void> {
    return this.writeStatusAtomically(
      this.statusPath(startIntent.executionId, startIntent.attemptId),
      { status: 'runtime_launching', pid: 0, nativeSessionId: null, output: null },
    );
  }

  private revokedPath(input: IsolatedCliStartIntent): string {
    return join(this.runRoot, input.executionId, input.attemptId, 'state', 'revoked');
  }
}

function extractSessionId(value: Record<string, unknown>): string | null {
  if (typeof value.session_id === 'string') return value.session_id;
  if (typeof value.thread_id === 'string') return value.thread_id;
  if (value.type === 'thread.started' && typeof value.thread_id === 'string') return value.thread_id;
  return null;
}

function extractText(value: Record<string, unknown>): string {
  if (value.type === 'item.completed') {
    const item = value.item as Record<string, unknown> | undefined;
    if (item?.type === 'agent_message' && typeof item.text === 'string') return item.text;
  }
  if (value.type === 'assistant') {
    const message = value.message as Record<string, unknown> | undefined;
    const content = Array.isArray(message?.content) ? message.content : [];
    return content
      .map((part) => part && typeof part === 'object' && (part as Record<string, unknown>).type === 'text'
        ? String((part as Record<string, unknown>).text ?? '')
        : '')
      .join('');
  }
  return '';
}

function extractFinalResult(value: Record<string, unknown>): string | null {
  return value.type === 'result' && typeof value.result === 'string'
    ? value.result
    : null;
}

function parseOutput(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { text };
  } catch {
    return { text };
  }
}

function intentKey(input: IsolatedCliStartIntent): string {
  return [
    input.organizationId,
    input.sessionId,
    input.executionId,
    input.attemptId,
    input.startIntentId,
  ].join(':');
}

function terminalEvent(
  state: PersistedStatus | null,
): DurableRuntimeAdapterEvent | null {
  if (state?.status === 'completed') {
    return {
      kind: 'terminal',
      status: 'completed',
      output: state.output ?? {},
    };
  }
  if (state?.status === 'cancelled') {
    return { kind: 'terminal', status: 'cancelled' };
  }
  if (state?.status === 'failed') {
    return {
      kind: 'terminal',
      status: 'failed',
      errorCode: 'CLI_RUNTIME_EXIT_FAILED',
    };
  }
  return null;
}

function isTerminalStatus(status: PersistedStatus["status"]): boolean {
  return status === "completed" || status === "cancelled" || status === "failed";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function settlesWithin(
  promise: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  return await Promise.race([
    promise.then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}
