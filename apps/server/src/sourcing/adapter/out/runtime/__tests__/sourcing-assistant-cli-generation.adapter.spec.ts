import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

import { SourcingAssistantCliGenerationAdapter } from '../sourcing-assistant-cli-generation.adapter';

function childProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child;
}

describe('SourcingAssistantCliGenerationAdapter', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('runs Claude with its actual empty tool list instead of the unsafe allowed-tools alias', async () => {
    const child = childProcess();
    spawnMock.mockReturnValueOnce(child);
    const adapter = new SourcingAssistantCliGenerationAdapter();

    const resultPromise = adapter.run({
      runtime: 'claude',
      model: 'claude-sonnet-4-6',
      prompt: '근거를 요약하세요.',
      timeoutMs: 45_000,
    });
    child.stdout.write(JSON.stringify({ result: '근거 요약' }));
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      ok: true,
      runtime: 'claude',
      text: '근거 요약',
    });

    const [, args, options] = spawnMock.mock.calls[0] ?? [];
    expect(args).toEqual(expect.arrayContaining(['--tools', '', '--strict-mcp-config']));
    expect(args).not.toContain('--allowed-tools');
    expect(options).toEqual(expect.objectContaining({ shell: false }));
    expect((options as { env: NodeJS.ProcessEnv }).env).not.toHaveProperty('DATABASE_URL');
  });

  it('runs Codex in ephemeral non-interactive mode with all local execution surfaces disabled', async () => {
    const child = childProcess();
    spawnMock.mockReturnValueOnce(child);
    const adapter = new SourcingAssistantCliGenerationAdapter();

    const resultPromise = adapter.run({
      runtime: 'codex',
      model: 'gpt-5.6-sol',
      prompt: '근거를 요약하세요.',
      timeoutMs: 45_000,
    });
    child.stdout.write('근거 요약');
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      ok: true,
      runtime: 'codex',
      text: '근거 요약',
    });

    const [command, args, options] = spawnMock.mock.calls[0] ?? [];
    expect(command).toBe('codex');
    expect(args).toEqual(expect.arrayContaining([
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '--disable',
      'shell_tool',
      'browser_use',
      'computer_use',
      'plugins',
    ]));
    expect(args).toEqual(expect.arrayContaining([
      'tools.view_image=false',
      'tools.web_search=false',
      'apps._default.enabled=false',
      'approval_policy="never"',
    ]));
    expect(options).toEqual(expect.objectContaining({ shell: false }));
  });
});
