import { describe, expect, it, vi } from 'vitest';
import { createServer, connect } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { AttemptMcpBrokerService, LocalAttemptMcpPeerVerifier, PythonAttemptMcpPeerCredentialReader } from './attempt-mcp-broker.service';

describe('Attempt-bound MCP broker', () => {
  it('binds a private socket to its live process and ignores caller supplied identity', async () => {
    const invocations: unknown[] = [];
    const descendantsOnly = { belongsToAttemptGroup: vi.fn((_binding, peerPid) => peerPid === 72) };
    const broker = new AttemptMcpBrokerService({
      invoke: async (input) => { invocations.push(input); return { accepted: input.invocationId }; },
      delegate: async () => ({}), child: async () => ({}),
    }, descendantsOnly);
    broker.bind({ socketPath: '/tmp/attempt.sock', attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'actual-user', processGroupId: 42, capabilityKeys: ['analytics.readOverview'] });
    const result = await broker.invoke({ socketPath: '/tmp/attempt.sock', peerPid: 72, capabilityKey: 'analytics.readOverview', arguments: { period: 'today' }, ignoredIdentity: { userId: 'forged' } });
    expect(result).toMatchObject({ accepted: expect.any(String) });
    expect(invocations[0]).toMatchObject({ binding: { userId: 'actual-user', attemptId: 'attempt' }, capabilityKey: 'analytics.readOverview' });
    expect(descendantsOnly.belongsToAttemptGroup).toHaveBeenCalledWith(expect.objectContaining({ processGroupId: 42 }), 72);
    await expect(broker.invoke({ socketPath: '/tmp/attempt.sock', peerPid: 41, capabilityKey: 'analytics.readOverview', arguments: {} })).rejects.toThrow('attempt_mcp_peer_rejected');
  });

  it('limits catalog, delegation, and child control to the bound Attempt scope', async () => {
    const delegated: unknown[] = [];
    const children: unknown[] = [];
    const ownedPeer = { belongsToAttemptGroup: vi.fn(() => true) };
    const broker = new AttemptMcpBrokerService({
      invoke: async () => ({}),
      delegate: async (input) => { delegated.push(input); return { childTaskId: 'child' }; },
      child: async (input) => { children.push(input); return { ok: true }; },
    }, ownedPeer);
    broker.bind({ socketPath: '/tmp/attempt.sock', attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', processGroupId: 42, capabilityKeys: ['analytics.readOverview', 'supply.submit_purchase_order'] });
    expect(broker.catalog('/tmp/attempt.sock', 42, 'analytics')).toEqual(['analytics.readOverview']);
    await broker.delegate({ socketPath: '/tmp/attempt.sock', peerPid: 42, targetAgentKey: 'supply', objective: 'submit' });
    await broker.child({ socketPath: '/tmp/attempt.sock', peerPid: 42, action: 'interrupt', childTaskId: 'child' });
    expect(delegated[0]).toMatchObject({ binding: { attemptId: 'attempt' }, targetAgentKey: 'supply' });
    expect(children[0]).toMatchObject({ action: 'interrupt', childTaskId: 'child' });
    broker.unbind('/tmp/attempt.sock');
    expect(() => broker.catalog('/tmp/attempt.sock', 42)).toThrow('attempt_mcp_peer_rejected');
  });

  it('proves a real local Unix connection belongs to a descendant Attempt process group', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-mcp-peer-'));
    const socketPath = join(root, 'attempt.sock');
    const reader = new PythonAttemptMcpPeerCredentialReader();
    const server = createServer({ pauseOnConnect: true });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    const client = spawn(process.execPath, ['-e', `const c=require('node:net').connect(${JSON.stringify(socketPath)}); setTimeout(()=>c.end(), 800);`], { detached: true, stdio: 'ignore' });
    try {
      const peerPid = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('peer_connect_timeout')), 2_000);
        server.once('connection', (socket) => {
          void reader.read(socket).then((pid) => {
            clearTimeout(timer);
            socket.destroy();
            pid ? resolve(pid) : reject(new Error('peer_credential_missing'));
          });
        });
      });
      const binding = { socketPath, attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', processGroupId: client.pid!, capabilityKeys: [] };
      const verifier = new LocalAttemptMcpPeerVerifier();
      expect(peerPid).toBe(client.pid);
      expect(verifier.belongsToAttemptGroup(binding, peerPid)).toBe(true);
      expect(verifier.belongsToAttemptGroup({ ...binding, processGroupId: 999_999 }, peerPid)).toBe(false);
    } finally {
      try { process.kill(-client.pid!, 'SIGKILL'); } catch { /* exited */ }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates the Invocation server-side after scoped socket admission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-mcp-broker-'));
    const socketPath = join(root, 'attempt.sock');
    const invocations: unknown[] = [];
    const broker = new AttemptMcpBrokerService({
      invoke: async (input) => { invocations.push(input); return { operation_ref: 'operation-1' }; },
      delegate: async () => ({}), child: async () => ({}),
    }, { belongsToAttemptGroup: () => true }, { read: async () => process.pid });
    try {
      await broker.listen({ socketPath, attemptId: 'attempt', sessionId: 'session', taskId: 'task', agentVersionId: 'version', organizationId: 'org', userId: 'user', processGroupId: process.pid, capabilityKeys: ['sourcing.collect_shadow_signals'] });
      const response = await unixRequest(socketPath, {
        tool: 'capability_invoke',
        arguments: { capabilityKey: 'sourcing.collect_shadow_signals', input: { source: 'catalog' } },
      });
      expect(response).toEqual({ operation_ref: 'operation-1' });
      expect(invocations).toEqual([expect.objectContaining({ capabilityKey: 'sourcing.collect_shadow_signals', binding: expect.objectContaining({ attemptId: 'attempt', organizationId: 'org' }) })]);
    } finally {
      await broker.close(socketPath);
      await rm(root, { recursive: true, force: true });
    }
  });
});

function unixRequest(socketPath: string, request: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let response = '';
    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('data', (chunk) => { response += chunk; });
    socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.once('close', () => {
      try { resolve(JSON.parse(response)); } catch (error) { reject(error); }
    });
  });
}
