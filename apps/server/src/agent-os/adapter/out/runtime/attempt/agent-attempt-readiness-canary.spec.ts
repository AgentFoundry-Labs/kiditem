import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentAttemptReadinessCanary } from './agent-attempt-readiness-canary';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('AgentAttemptReadinessCanary', () => {
  it('drives Codex through scoped marker, second steer, strict result, and owned cleanup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const child of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, child));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const stdout = new EventEmitter(); const stderr = new EventEmitter(); const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9911, exitCode: null, signalCode: null, stdout, stderr: Object.assign(stderr, { resume: vi.fn() }), stdin: { write: vi.fn() } });
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    child.stdin.write.mockImplementation((line: string) => {
      const request = JSON.parse(line) as { id?: string; method?: string; params?: any };
      if (request.method === 'initialize') stdout.emit('data', `${JSON.stringify({ id: request.id, result: {} })}\n`);
      if (request.method === 'thread/start') stdout.emit('data', `${JSON.stringify({ id: request.id, result: { thread: { id: 'thread' }, activePermissionProfile: { id: 'kiditem_attempt' } } })}\n`);
      if (request.method === 'turn/start') {
        const nonce = /nonce ([0-9a-f-]{36})/.exec(request.params.input[0].text)![1];
        writeFileSync(join(root, 'canary-called'), nonce);
        stdout.emit('data', `${JSON.stringify({ id: request.id, result: { turn: { id: 'turn' } } })}\n`);
      }
      if (request.method === 'turn/steer') {
        stdout.emit('data', `${JSON.stringify({ id: request.id, result: {} })}\n`);
        const nonce = /nonce ([0-9a-f-]{36})/.exec(request.params.input[0].text)![1];
        const wait = setInterval(() => {
          if (!existsSync(join(root, 'canary-release'))) return;
          clearInterval(wait);
          stdout.emit('data', `${JSON.stringify({ method: 'turn/completed', params: { turn: { status: 'completed', items: [{ type: 'agentMessage', text: JSON.stringify({ outcome: 'completed', summary: `readiness:${nonce}`, resourceRefs: [], operationRefs: [] }) }] } } })}\n`);
        }, 1);
      }
    });
    vi.spyOn(process, 'kill').mockImplementation(() => { child.exitCode = 0; child.emit('exit', 0); return true; });
    const canary = new AgentAttemptReadinessCanary(files as never, (() => child) as never, 500);
    await canary.run({ runtime: 'codex_cli', model: 'gpt-test', loginHome: '/login' });
    expect(child.stdin.write.mock.calls.map(([line]: [string]) => JSON.parse(line).method)).toEqual(expect.arrayContaining(['initialize', 'initialized', 'thread/start', 'turn/start', 'turn/steer']));
    expect(readFileSync(join(root, 'canary-release'), 'utf8')).toMatch(/^[0-9a-f-]{36}$/);
    expect(files.remove).toHaveBeenCalledWith(paths);
    expect(process.kill).toHaveBeenCalledWith(-9911, 'SIGTERM');
  });

  it('drives Claude stream-json through a scoped call, second input, and structured result', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const stdout = new EventEmitter(); const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9912, exitCode: null, signalCode: null, stdout, stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    let prompts = 0;
    child.stdin.write.mockImplementation((line: string) => {
      const message = JSON.parse(line) as { message?: { content?: string } };
      const content = message.message?.content ?? ''; prompts += 1;
      const nonce = /nonce ([0-9a-f-]{36})/.exec(content)?.[1];
      if (prompts === 1 && nonce) writeFileSync(join(root, 'canary-called'), nonce);
      if (prompts === 2 && nonce) {
        const wait = setInterval(() => { if (existsSync(join(root, 'canary-release'))) { clearInterval(wait); stdout.emit('data', `${JSON.stringify({ type: 'result', structured_output: { outcome: 'completed', summary: `readiness:${nonce}`, resourceRefs: [], operationRefs: [] } })}\n`); } }, 1);
      }
    });
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    vi.spyOn(process, 'kill').mockImplementation(() => { child.exitCode = 0; child.emit('exit', 0); return true; });
    await new AgentAttemptReadinessCanary(files as never, (() => child) as never, 500).run({ runtime: 'claude_cli', model: 'claude-test', loginHome: '/login' });
    expect(prompts).toBe(2);
    expect(files.remove).toHaveBeenCalledWith(paths);
    expect(process.kill).toHaveBeenCalledWith(-9912, 'SIGTERM');
  });

  it('times out without a scoped call, escalates TERM to KILL, and preserves the root when the group remains live', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9913, exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    await expect(new AgentAttemptReadinessCanary(files as never, (() => child) as never, 10).run({ runtime: 'claude_cli', model: 'claude-test', loginHome: '/login' })).rejects.toThrow('readiness_canary_timeout');
    expect(kill).toHaveBeenCalledWith(-9913, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(-9913, 'SIGKILL');
    expect(files.remove).not.toHaveBeenCalled();
  });

  it('rejects a terminal envelope whose summary merely contains the readiness nonce', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const stdout = new EventEmitter(); const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9914, exitCode: null, signalCode: null, stdout, stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    let prompts = 0;
    child.stdin.write.mockImplementation((line: string) => {
      const content = (JSON.parse(line) as { message?: { content?: string } }).message?.content ?? '';
      const nonce = /nonce ([0-9a-f-]{36})/.exec(content)?.[1];
      prompts += 1;
      if (prompts === 1 && nonce) writeFileSync(join(root, 'canary-called'), nonce);
      if (prompts === 2 && nonce) stdout.emit('data', `${JSON.stringify({ type: 'result', structured_output: { outcome: 'completed', summary: `tool output included readiness:${nonce}`, resourceRefs: [], operationRefs: [] } })}\n`);
    });
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    vi.spyOn(process, 'kill').mockImplementation(() => { child.exitCode = 0; child.emit('exit', 0); return true; });
    await expect(new AgentAttemptReadinessCanary(files as never, (() => child) as never, 500).run({ runtime: 'claude_cli', model: 'claude-test', loginHome: '/login' })).rejects.toThrow('readiness_canary_nonce_missing');
  });

  it('fails immediately when the child exits nonzero before the scoped marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9915, exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    child.stdin.write.mockImplementation(() => { child.exitCode = 1; child.emit('exit', 1); });
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    const started = Date.now();
    await expect(new AgentAttemptReadinessCanary(files as never, (() => child) as never, 5_000).run({ runtime: 'claude_cli', model: 'claude-test', loginHome: '/login' })).rejects.toThrow('readiness_canary_child_exit');
    expect(Date.now() - started).toBeLessThan(500);
    expect(files.remove).toHaveBeenCalledWith(paths);
  });

  it('bounds malformed Codex protocol output instead of accepting it as a readiness result', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const stdout = new EventEmitter(); const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9916, exitCode: null, signalCode: null, stdout, stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    child.stdin.write.mockImplementation(() => stdout.emit('data', 'not-json\n'));
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    vi.spyOn(process, 'kill').mockImplementation(() => { child.exitCode = 0; child.emit('exit', 0); return true; });
    await expect(new AgentAttemptReadinessCanary(files as never, (() => child) as never, 500).run({ runtime: 'codex_cli', model: 'gpt-test', loginHome: '/login' })).rejects.toThrow('codex_app_server_output_invalid');
  });

  it('bounds oversized malformed Claude output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const stdout = new EventEmitter(); const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9917, exitCode: null, signalCode: null, stdout, stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    child.stdin.write.mockImplementation(() => stdout.emit('data', 'x'.repeat(64 * 1024 + 1)));
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    vi.spyOn(process, 'kill').mockImplementation(() => { child.exitCode = 0; child.emit('exit', 0); return true; });
    await expect(new AgentAttemptReadinessCanary(files as never, (() => child) as never, 500).run({ runtime: 'claude_cli', model: 'claude-test', loginHome: '/login' })).rejects.toThrow('readiness_canary_stream_too_large');
  });

  it('fails malformed Claude stream-json protocol without waiting for the canary timeout', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const stdout = new EventEmitter(); const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9918, exitCode: null, signalCode: null, stdout, stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    child.stdin.write.mockImplementation(() => stdout.emit('data', 'not-json\n'));
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    vi.spyOn(process, 'kill').mockImplementation(() => { child.exitCode = 0; child.emit('exit', 0); return true; });
    const started = Date.now();
    await expect(new AgentAttemptReadinessCanary(files as never, (() => child) as never, 5_000).run({ runtime: 'claude_cli', model: 'claude-test', loginHome: '/login' })).rejects.toThrow('readiness_canary_protocol_invalid');
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('preserves the original probe failure when process-group cleanup also fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canary-')); roots.push(root);
    for (const childPath of ['workspace', 'broker', 'home', 'codex', 'claude']) mkdirSync(join(root, childPath));
    const paths = { root, workspace: join(root, 'workspace'), broker: join(root, 'broker'), socketPath: join(root, 'broker', 'socket'), mcpConfigPath: join(root, 'broker', 'mcp.json'), home: join(root, 'home'), codexHome: join(root, 'codex'), claudeConfigDir: join(root, 'claude') };
    const child = new EventEmitter() as any;
    Object.assign(child, { pid: 9919, exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: Object.assign(new EventEmitter(), { resume: vi.fn() }), stdin: { write: vi.fn() } });
    const files = { create: vi.fn(async () => paths), linkProviderAuth: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
    vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); });
    await expect(new AgentAttemptReadinessCanary(files as never, (() => child) as never, 10).run({ runtime: 'claude_cli', model: 'claude-test', loginHome: '/login' })).rejects.toThrow('readiness_canary_timeout');
    expect(files.remove).not.toHaveBeenCalled();
  });
});
