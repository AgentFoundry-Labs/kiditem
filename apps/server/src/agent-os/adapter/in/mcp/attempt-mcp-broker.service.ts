import { randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server, type Socket } from 'node:net';
import { rm } from 'node:fs/promises';
import type {
  AttemptMcpActionsPort,
  AttemptMcpBinding,
} from '../../../application/port/in/mcp/attempt-mcp-actions.port';

export type { AttemptMcpBinding } from '../../../application/port/in/mcp/attempt-mcp-actions.port';

export interface AttemptMcpPeerVerifier {
  belongsToAttemptGroup(binding: AttemptMcpBinding, peerPid: number): boolean;
}

/** Uses OS process metadata, never a client-supplied organization or user value. */
export class LocalAttemptMcpPeerVerifier implements AttemptMcpPeerVerifier {
  belongsToAttemptGroup(binding: AttemptMcpBinding, peerPid: number): boolean {
    try {
      const pgid = execFileSync('ps', ['-o', 'pgid=', '-p', String(peerPid)], { encoding: 'utf8', timeout: 1_000 }).trim();
      return Number(pgid) === binding.processGroupId;
    } catch {
      return false;
    }
  }

}

export interface AttemptMcpPeerCredentialReader {
  read(socket: Socket): Promise<number | null>;
}

/**
 * Node does not expose Darwin LOCAL_PEERPID. This bounded helper receives only
 * the accepted Unix socket fd, asks the kernel for the peer pid, and exits.
 */
export class PythonAttemptMcpPeerCredentialReader implements AttemptMcpPeerCredentialReader {
  constructor(
    private readonly pythonBin = process.env.PYTHON_BIN || 'python3',
    private readonly spawnChild: typeof spawn = spawn,
    private readonly timeoutMs = 1_000,
  ) {}

  read(socket: Socket): Promise<number | null> {
    return new Promise((resolve) => {
      let output = '';
      let settled = false;
      let helper: ChildProcess | undefined;
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => { helper?.kill('SIGKILL'); finish(null); }, this.timeoutMs);
      try {
        helper = this.spawnChild(this.pythonBin, ['-c', PEER_CREDENTIAL_SCRIPT], {
          shell: false,
          stdio: ['ignore', 'pipe', 'ignore', socket],
        });
        helper.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
        helper.once('error', () => finish(null));
        helper.once('close', (code) => {
          const value = output.trim();
          finish(code === 0 && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null);
        });
      } catch {
        finish(null);
      }
    });
  }
}

const PEER_CREDENTIAL_SCRIPT = [
  'import socket, struct, sys',
  'peer = socket.socket(fileno=3)',
  'if sys.platform == "darwin":',
  '  pid = struct.unpack("i", peer.getsockopt(0, 2, 4))[0]',
  'else:',
  '  pid = struct.unpack("3i", peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[0]',
  'print(pid)',
].join('\n');

/** API-memory authority for exactly one private, local Attempt socket. */
export class AttemptMcpBrokerService {
  private readonly bindings = new Map<string, AttemptMcpBinding>();
  private readonly servers = new Map<string, Server>();
  private readonly sockets = new Map<string, Set<Socket>>();

  constructor(
    private readonly actions: AttemptMcpActionsPort,
    private readonly peers: AttemptMcpPeerVerifier = new LocalAttemptMcpPeerVerifier(),
    private readonly credentials: AttemptMcpPeerCredentialReader = new PythonAttemptMcpPeerCredentialReader(),
  ) {}

  bind(binding: AttemptMcpBinding): void {
    if (!binding.socketPath.startsWith('/') || this.bindings.has(binding.socketPath)) throw new Error('attempt_mcp_socket_invalid');
    this.bindings.set(binding.socketPath, { ...binding, capabilityKeys: [...binding.capabilityKeys] });
  }

  unbind(socketPath: string): void { this.bindings.delete(socketPath); }

  async listen(binding: AttemptMcpBinding): Promise<void> {
    this.bind(binding);
    await rm(binding.socketPath, { force: true });
    const server = createServer({ pauseOnConnect: true }, (socket) => {
      const sockets = this.sockets.get(binding.socketPath) ?? new Set<Socket>();
      sockets.add(socket);
      this.sockets.set(binding.socketPath, sockets);
      socket.once('close', () => sockets.delete(socket));
      void this.handleSocket(binding.socketPath, socket);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(binding.socketPath, () => { server.off('error', reject); resolve(); });
    });
    this.servers.set(binding.socketPath, server);
  }

  async close(socketPath: string): Promise<void> {
    const server = this.servers.get(socketPath);
    this.servers.delete(socketPath);
    this.unbind(socketPath);
    for (const socket of this.sockets.get(socketPath) ?? []) socket.destroy();
    this.sockets.delete(socketPath);
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(socketPath, { force: true });
  }

  catalog(socketPath: string, peerPid: number, query = ''): ReturnType<AttemptMcpActionsPort['catalog']> {
    const binding = this.authorize(socketPath, peerPid);
    return this.actions.catalog({ binding, query });
  }

  async invoke(input: { socketPath: string; peerPid: number; capabilityKey: string; arguments: Record<string, unknown>; ignoredIdentity?: unknown }): Promise<unknown> {
    const binding = this.authorize(input.socketPath, input.peerPid);
    return this.actions.invoke({ invocationId: randomUUID(), binding, capabilityKey: input.capabilityKey, input: input.arguments });
  }

  delegate(input: { socketPath: string; peerPid: number; targetAgentKey: string; objective: string }): Promise<unknown> {
    return this.actions.delegate({ binding: this.authorize(input.socketPath, input.peerPid), targetAgentKey: input.targetAgentKey, objective: input.objective });
  }

  child(input: { socketPath: string; peerPid: number; action: 'status' | 'wait' | 'result' | 'message' | 'interrupt'; childTaskId: string; message?: string }): Promise<unknown> {
    return this.actions.child({ ...input, binding: this.authorize(input.socketPath, input.peerPid) });
  }

  private authorize(socketPath: string, peerPid: number): AttemptMcpBinding {
    const binding = this.bindings.get(socketPath);
    if (!binding || !this.peers.belongsToAttemptGroup(binding, peerPid)) throw new Error('attempt_mcp_peer_rejected');
    return binding;
  }

  private async handleSocket(socketPath: string, socket: Socket): Promise<void> {
    const binding = this.bindings.get(socketPath);
    const peerPid = await this.credentials.read(socket);
    if (!binding || !peerPid || !this.peers.belongsToAttemptGroup(binding, peerPid)) { socket.destroy(); return; }
    let line = '';
    let handled = false;
    const timeout = setTimeout(() => socket.destroy(), 10_000);
    socket.setEncoding('utf8');
    const respond = async () => {
      if (handled) return;
      handled = true;
      try {
        const request = JSON.parse(line) as { tool?: string; arguments?: Record<string, unknown> };
        const arguments_ = request.arguments ?? {};
        const result = await this.route(socketPath, peerPid, request.tool, arguments_);
        socket.end(JSON.stringify(result));
      } catch (error) {
        socket.end(JSON.stringify({ error: error instanceof Error ? error.message : 'attempt_mcp_failed' }));
      }
    };
    socket.on('data', (chunk) => {
      line += chunk;
      if (Buffer.byteLength(line, 'utf8') > 64 * 1024) { socket.destroy(); return; }
      if (line.includes('\n')) { line = line.slice(0, line.indexOf('\n')); void respond(); }
    });
    socket.once('end', () => { void respond(); });
    socket.once('close', () => clearTimeout(timeout));
    socket.resume();
  }

  private route(socketPath: string, peerPid: number, tool: string | undefined, arguments_: Record<string, unknown>): Promise<unknown> | unknown {
    switch (tool) {
      case 'capability_catalog_search': return this.catalog(socketPath, peerPid, String(arguments_.query ?? ''));
      case 'capability_invoke': return this.invoke({ socketPath, peerPid, capabilityKey: String(arguments_.capabilityKey), arguments: asRecord(arguments_.input) });
      case 'delegate_to_agent': return this.delegate({ socketPath, peerPid, targetAgentKey: String(arguments_.targetAgentKey), objective: String(arguments_.objective) });
      case 'child_status': case 'child_wait': case 'child_result': case 'child_message': case 'child_interrupt':
        return this.child({ socketPath, peerPid, action: tool.slice('child_'.length) as 'status' | 'wait' | 'result' | 'message' | 'interrupt', childTaskId: String(arguments_.childTaskId), ...(typeof arguments_.message === 'string' ? { message: arguments_.message } : {}) });
      default: throw new Error('attempt_mcp_tool_not_found');
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('attempt_mcp_input_invalid');
  return value as Record<string, unknown>;
}
