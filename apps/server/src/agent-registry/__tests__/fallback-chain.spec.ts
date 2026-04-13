import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeFallbackChain } from '../adapters/fallback-chain';
import type { ExecutionContext, ExecutionResult, StreamEvent } from '../adapters/types';
import { collectResult } from '../adapters/types';

// Mock the registry module
vi.mock('../adapters/registry', () => ({
  getAdapter: vi.fn(),
}));

import { getAdapter } from '../adapters/registry';

const mockGetAdapter = vi.mocked(getAdapter);

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return Object.freeze({
    runId: 'run-1',
    agent: Object.freeze({ id: 'a1', name: 'test', type: 'test', permissions: {} }),
    config: Object.freeze({}),
    prompt: 'test prompt',
    skillPaths: Object.freeze([]),
    timeoutSec: 60,
    graceSec: 10,
    env: Object.freeze({}),
    cwd: '/tmp',
    allowedTools: 'Read',
    permissionMode: 'default',
    maxOutputTokens: 8000,
    ...overrides,
  });
}

function makeSuccessResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return { exitCode: 0, signal: null, timedOut: false, stdout: 'ok', stderr: '', ...overrides };
}

function makeFailResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return { exitCode: 1, signal: null, timedOut: false, stdout: '', stderr: 'fail', ...overrides };
}

/** Build a mock adapter whose execute() returns an AsyncGenerator yielding events then returning result. */
function makeAdapter(result: ExecutionResult, events: StreamEvent[] = []) {
  return {
    type: 'mock',
    execute: vi.fn((_ctx: ExecutionContext) => {
      async function* gen(): AsyncGenerator<StreamEvent, ExecutionResult> {
        for (const e of events) yield e;
        return result;
      }
      return gen();
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeFallbackChain', () => {
  it('single adapter succeeds → returns result', async () => {
    const adapter = makeAdapter(makeSuccessResult({ stdout: 'single-success' }));
    mockGetAdapter.mockReturnValue(adapter as any);

    const ctx = makeCtx();
    const result = await collectResult(executeFallbackChain(['claude_local'], ctx));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('single-success');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  it('first adapter fails, second succeeds → fallback event emitted', async () => {
    const failAdapter = makeAdapter(makeFailResult({ stderr: 'first-fail' }));
    const successAdapter = makeAdapter(makeSuccessResult({ stdout: 'fallback-success' }));

    mockGetAdapter
      .mockReturnValueOnce(failAdapter as any)
      .mockReturnValueOnce(successAdapter as any);

    const eventEmitter = { emit: vi.fn() } as any;
    const ctx = makeCtx();
    const result = await collectResult(executeFallbackChain(['adapter_a', 'adapter_b'], ctx, eventEmitter));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('fallback-success');

    // fallback success event emitted
    expect(eventEmitter.emit).toHaveBeenCalledWith('agent.fallback', expect.objectContaining({
      from: 'adapter_a',
      to: 'adapter_b',
      runId: 'run-1',
    }));
    // attempt event emitted for the failing adapter
    expect(eventEmitter.emit).toHaveBeenCalledWith('agent.fallback.attempt', expect.objectContaining({
      adapter: 'adapter_a',
      exitCode: 1,
    }));
  });

  it('all adapters fail → returns first adapter error', async () => {
    const fail1 = makeAdapter(makeFailResult({ stderr: 'first-error', exitCode: 2 }));
    const fail2 = makeAdapter(makeFailResult({ stderr: 'second-error', exitCode: 3 }));

    mockGetAdapter
      .mockReturnValueOnce(fail1 as any)
      .mockReturnValueOnce(fail2 as any);

    const ctx = makeCtx();
    const result = await collectResult(executeFallbackChain(['a1', 'a2'], ctx));

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('first-error');
  });

  it('empty adapter list → returns error result immediately', async () => {
    const ctx = makeCtx();
    const result = await collectResult(executeFallbackChain([], ctx));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('No adapters configured');
    expect(mockGetAdapter).not.toHaveBeenCalled();
  });

  it('stream events from successful adapter are yielded', async () => {
    const events: StreamEvent[] = [
      { type: 'token_count', data: { input: 10, output: 5 } },
      { type: 'content', data: 'hello' },
    ];
    const adapter = makeAdapter(makeSuccessResult(), events);
    mockGetAdapter.mockReturnValue(adapter as any);

    const ctx = makeCtx();
    const gen = executeFallbackChain(['claude_local'], ctx);

    const yielded: StreamEvent[] = [];
    let iter = await gen.next();
    while (!iter.done) {
      yielded.push(iter.value);
      iter = await gen.next();
    }

    expect(yielded).toHaveLength(2);
    expect(yielded[0].type).toBe('token_count');
    expect(yielded[1].type).toBe('content');
    expect(iter.value.exitCode).toBe(0);
  });

  it('adapter throws → saves as first error, tries next', async () => {
    mockGetAdapter
      .mockImplementationOnce(() => {
        return {
          type: 'throw-adapter',
          execute: vi.fn(() => {
            async function* gen(): AsyncGenerator<StreamEvent, ExecutionResult> {
              throw new Error('unexpected crash');
              yield { type: 'content', data: '' }; // never reached
              return { exitCode: 0, signal: null, timedOut: false, stdout: '', stderr: '' };
            }
            return gen();
          }),
        } as any;
      })
      .mockReturnValueOnce(makeAdapter(makeSuccessResult({ stdout: 'recovery' })) as any);

    const ctx = makeCtx();
    const result = await collectResult(executeFallbackChain(['crasher', 'fallback'], ctx));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('recovery');
  });

  it('all adapters throw → returns error with first adapter message', async () => {
    mockGetAdapter
      .mockImplementationOnce(() => ({
        type: 'throw1',
        execute: vi.fn(() => {
          async function* gen(): AsyncGenerator<StreamEvent, ExecutionResult> {
            throw new Error('crash-1');
            yield { type: 'content', data: '' }; // never reached
            return { exitCode: 0, signal: null, timedOut: false, stdout: '', stderr: '' };
          }
          return gen();
        }),
      } as any))
      .mockImplementationOnce(() => ({
        type: 'throw2',
        execute: vi.fn(() => {
          async function* gen(): AsyncGenerator<StreamEvent, ExecutionResult> {
            throw new Error('crash-2');
            yield { type: 'content', data: '' }; // never reached
            return { exitCode: 0, signal: null, timedOut: false, stdout: '', stderr: '' };
          }
          return gen();
        }),
      } as any));

    const ctx = makeCtx();
    const result = await collectResult(executeFallbackChain(['a', 'b'], ctx));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('crash-1');
  });
});
