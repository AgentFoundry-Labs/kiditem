import { afterEach, describe, expect, it, vi } from 'vitest';
import { pythonHttpAdapter } from '../python-http/execute';
import type { ExecutionContext } from '../types';
import { collectResult } from '../types';

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return Object.freeze({
    runId: 'run-1',
    agent: Object.freeze({ id: 'agent-1', name: 'Python agent', type: 'content', permissions: {} }),
    config: Object.freeze({ baseUrl: 'http://python.test' }),
    prompt: 'run',
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pythonHttpAdapter', () => {
  it('uses adapter config input when payload is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ output: { ok: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeCtx({
      config: Object.freeze({
        baseUrl: 'http://python.test',
        input: { task_input: { productId: 'product-1' } },
      }),
      payload: Object.freeze({}),
    });

    const result = await collectResult(pythonHttpAdapter.execute(ctx));

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.input).toEqual({ task_input: { productId: 'product-1' } });
  });
});
