import { randomUUID } from 'node:crypto';
import type {
  ProviderEvent,
  ProviderMessage,
  ProviderReadiness,
} from '@kiditem/shared/agent-runtime';
import { buildClaudeTurnCommand } from './claude-command';
import { ClaudeStreamParser } from './claude-stream-parser';
import type { GatewayProviderCommand } from './provider-command';
import type {
  CreateProviderConversation,
  InterruptProviderTurn,
  ProviderConversation,
  ProviderConversationPort,
  ProviderConversationSummary,
  ProviderEventSink,
  SendProviderInput,
  StartProviderTurn,
} from './provider-conversation.port';

export interface ClaudeMcpConfigPort {
  create(input: { turnId: string; mcpUrl: string; executionBinding: string }): Promise<string>;
  remove(path: string): Promise<void>;
}

export interface ClaudeProviderHistoryPort {
  exists(sessionId: string): Promise<boolean>;
  read(sessionId: string): Promise<ProviderMessage[]>;
}

export interface ClaudeTurnHandle {
  sendInput(input: string): Promise<void>;
  interrupt(): Promise<void>;
}

export interface ClaudeProcessLauncher {
  start(input: Readonly<{
    command: GatewayProviderCommand;
    input: string;
    onOutput: (chunk: string) => void;
    onExit: (code: number | null) => void;
  }>): Promise<ClaudeTurnHandle>;
}

type ActiveClaudeTurn = Readonly<{
  providerConversationRef: string;
  turnId: string;
  handle: ClaudeTurnHandle;
  configPath: string;
  sink: ProviderEventSink;
}>;

/**
 * Claude Code has documented session create/resume stream flags, but no native
 * list, title, or destructive session endpoint. List/name are descriptor
 * concerns; delete explicitly reports bounded provider unavailability so the
 * local descriptor is never removed under a false provider success.
 */
export class ClaudeConversationProvider implements ProviderConversationPort {
  readonly runtime = 'claude_cli' as const;
  private readonly active = new Map<string, ActiveClaudeTurn>();

  constructor(private readonly options: Readonly<{
    runtimeRoot: string;
    workspace: string;
    loginRoot: string;
    mcpUrl: string;
    configs: ClaudeMcpConfigPort;
    launcher: ClaudeProcessLauncher;
    history: ClaudeProviderHistoryPort;
    readiness: ProviderReadiness;
    randomSessionId?: () => string;
  }>) {}

  async list(): Promise<ProviderConversationSummary[]> { return []; }

  async create(input: CreateProviderConversation): Promise<ProviderConversation> {
    const providerConversationRef = (this.options.randomSessionId ?? randomUUID)();
    const timestamp = new Date().toISOString();
    return { providerConversationRef, title: input.title ?? 'New conversation', createdAt: timestamp, updatedAt: timestamp };
  }

  history(providerConversationRef: string): Promise<ProviderMessage[]> {
    return this.options.history.read(providerConversationRef);
  }

  async rename(_providerConversationRef: string, _title: string): Promise<void> {
    // The installed Claude CLI exposes no session-name command. The title is
    // bounded descriptor metadata and never represented as provider history.
  }

  async delete(_providerConversationRef: string): Promise<void> {
    throw new Error('claude_provider_delete_unsupported');
  }

  async startTurn(input: StartProviderTurn, sink: ProviderEventSink): Promise<void> {
    const key = turnKey(input.providerConversationRef, input.turnId);
    if (this.active.has(key)) throw new Error('claude_turn_already_live');
    const configPath = await this.options.configs.create({
      turnId: input.turnId,
      mcpUrl: this.options.mcpUrl,
      executionBinding: input.executionBinding,
    });
    let resume: boolean;
    try {
      // Provider state, not Gateway process memory, decides first-session
      // versus resume semantics after a Gateway restart.
      resume = await this.options.history.exists(input.providerConversationRef);
    } catch {
      await this.options.configs.remove(configPath).catch(() => undefined);
      throw new Error('claude_provider_session_state_unavailable');
    }
    const command = buildClaudeTurnCommand({
      runtimeRoot: this.options.runtimeRoot,
      workspace: this.options.workspace,
      loginRoot: this.options.loginRoot,
      mcpConfigPath: configPath,
      sessionId: input.providerConversationRef,
      resume,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      instructionProfile: input.instructionProfile,
    });
    let active: ActiveClaudeTurn | undefined;
    const parser = new ClaudeStreamParser({ redactionTokens: [input.executionBinding] });
    const earlyEvents: ProviderEvent[] = [];
    let earlyOutputFailed = false;
    let earlyExit: number | null | undefined;
    try {
      const handle = await this.options.launcher.start({
        command,
        input: streamInput(input.message),
        onOutput: (chunk) => {
          let events: ProviderEvent[];
          try { events = parser.receive(chunk); }
          catch {
            if (active) this.finish(active, 'failed');
            else earlyOutputFailed = true;
            return;
          }
          if (active) {
            for (const event of events) this.emit(active, event);
            return;
          }
          if (earlyEvents.length + events.length > 64) { earlyOutputFailed = true; return; }
          earlyEvents.push(...events);
        },
        onExit: (code) => {
          if (!active) { earlyExit = code; return; }
          this.finish(active, code === 0 ? 'completed' : 'failed');
        },
      });
      active = Object.freeze({
        providerConversationRef: input.providerConversationRef,
        turnId: input.turnId,
        handle,
        configPath,
        sink,
      });
      this.active.set(key, active);
      sink({ kind: 'status', status: 'started' });
      if (earlyOutputFailed) {
        this.finish(active, 'failed');
        return;
      }
      for (const event of earlyEvents) {
        if (this.active.get(key) !== active) break;
        this.emit(active, event);
      }
      if (this.active.get(key) === active && earlyExit !== undefined) this.finish(active, earlyExit === 0 ? 'completed' : 'failed');
    } catch (error) {
      await this.options.configs.remove(configPath).catch(() => undefined);
      throw error;
    }
  }

  async sendInput(input: SendProviderInput): Promise<void> {
    await this.require(input.providerConversationRef, input.turnId).handle.sendInput(streamInput(input.message));
  }

  async interrupt(input: InterruptProviderTurn): Promise<void> {
    const active = this.require(input.providerConversationRef, input.turnId);
    await active.handle.interrupt();
    this.finish(active, 'interrupted');
  }

  async readiness(): Promise<ProviderReadiness> {
    if (this.options.readiness.runtime !== this.runtime) throw new Error('claude_readiness_invalid');
    return this.options.readiness;
  }

  /** Gateway loss never leaves a provider child holding an execution binding. */
  async close(): Promise<void> {
    await Promise.all([...this.active.values()].map(async (active) => {
      try { await active.handle.interrupt(); }
      catch { /* process may already have exited */ }
      this.finish(active, 'disconnected');
    }));
  }

  private require(providerConversationRef: string, turnId: string): ActiveClaudeTurn {
    const active = this.active.get(turnKey(providerConversationRef, turnId));
    if (!active) throw new Error('claude_turn_not_live');
    return active;
  }

  private emit(active: ActiveClaudeTurn, event: ProviderEvent): void {
    if (this.active.get(turnKey(active.providerConversationRef, active.turnId)) !== active) return;
    active.sink(event);
    if (event.kind === 'status' && event.status !== 'started') this.finish(active, event.status, true);
  }

  private finish(
    active: ActiveClaudeTurn,
    status: 'completed' | 'failed' | 'interrupted' | 'disconnected',
    terminalAlreadyEmitted = false,
  ): void {
    const key = turnKey(active.providerConversationRef, active.turnId);
    if (this.active.get(key) !== active) return;
    this.active.delete(key);
    void this.options.configs.remove(active.configPath).catch(() => undefined);
    if (!terminalAlreadyEmitted) active.sink({ kind: 'status', status });
  }
}

function streamInput(message: string): string {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: message } })}\n`;
}

function turnKey(providerConversationRef: string, turnId: string): string {
  return `${providerConversationRef}\u0000${turnId}`;
}
