import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface GatewayMcpProcessRegistration {
  installationId: string;
  gatewayInstanceId: string;
  /** Process-scoped opaque transport bearer; it is never persisted or logged. */
  mcpTransportToken: string;
}

export interface GatewayMcpActiveTurnInput {
  installationId: string;
  gatewayInstanceId: string;
  organizationId: string;
  initiatingUserId: string;
  conversationId: string;
  turnId: string;
}

export interface ResolvedGatewayMcpActiveTurn {
  executionId: string;
  installationId: string;
  gatewayInstanceId: string;
  organizationId: string;
  initiatingUserId: string;
  conversationId: string;
  turnId: string;
}

export class GatewayMcpTransportInvalidError extends Error {
  readonly code = 'MCP_TRANSPORT_INVALID';

  constructor() {
    super('MCP_TRANSPORT_INVALID');
    this.name = 'GatewayMcpTransportInvalidError';
  }
}

export class GatewayMcpActiveTurnInactiveError extends Error {
  readonly code = 'MCP_ACTIVE_TURN_INACTIVE';

  constructor() {
    super('MCP_ACTIVE_TURN_INACTIVE');
    this.name = 'GatewayMcpActiveTurnInactiveError';
  }
}

export class GatewayMcpActiveTurnConflictError extends Error {
  readonly code = 'MCP_ACTIVE_TURN_CONFLICT';

  constructor() {
    super('MCP_ACTIVE_TURN_CONFLICT');
    this.name = 'GatewayMcpActiveTurnConflictError';
  }
}

export class GatewayMcpProcessRegistrationConflictError extends Error {
  readonly code = 'MCP_PROCESS_REGISTRATION_CONFLICT';

  constructor() {
    super('MCP_PROCESS_REGISTRATION_CONFLICT');
    this.name = 'GatewayMcpProcessRegistrationConflictError';
  }
}

interface StoredProcess {
  installationId: string;
  gatewayInstanceId: string;
  token: Buffer;
}

/**
 * The sole private runtime correlation store. The process bearer authenticates
 * transport only; active-turn records supply every business authority at tool
 * invocation time. Neither map is durable and neither has a timer or renewal.
 */
@Injectable()
export class GatewayMcpRuntimeRegistry {
  private readonly processesByToken = new Map<string, StoredProcess>();
  private readonly activeTurnsByConversation = new Map<string, ResolvedGatewayMcpActiveTurn>();
  private currentProcess: StoredProcess | null = null;

  constructor(private readonly uuid: () => string = randomUUID) {}

  /** Idempotent for a repeated poll from the same process; a new instance replaces all live state. */
  registerProcess(input: GatewayMcpProcessRegistration): boolean {
    const current = this.currentProcess;
    if (current && current.installationId === input.installationId && current.gatewayInstanceId === input.gatewayInstanceId) {
      if (sameToken(input.mcpTransportToken, current.token)) return false;
      throw new GatewayMcpProcessRegistrationConflictError();
    }
    if (current) this.clear();
    const process: StoredProcess = {
      installationId: input.installationId,
      gatewayInstanceId: input.gatewayInstanceId,
      token: Buffer.from(input.mcpTransportToken, 'utf8'),
    };
    this.currentProcess = process;
    this.processesByToken.set(input.mcpTransportToken, process);
    return true;
  }

  /** Verifies the opaque transport bearer without granting capability authority. */
  authenticate(mcpTransportToken: string): Readonly<{ installationId: string; gatewayInstanceId: string }> {
    const process = this.processesByToken.get(mcpTransportToken);
    if (!process || !sameToken(mcpTransportToken, process.token)) throw new GatewayMcpTransportInvalidError();
    return { installationId: process.installationId, gatewayInstanceId: process.gatewayInstanceId };
  }

  /** Starts exactly one authoritative turn per conversation, preserving exact retries only. */
  activateTurn(input: GatewayMcpActiveTurnInput): ResolvedGatewayMcpActiveTurn {
    this.requireCurrentProcess(input);
    const existing = this.activeTurnsByConversation.get(input.conversationId);
    if (existing) {
      if (sameTurn(existing, input)) return existing;
      throw new GatewayMcpActiveTurnConflictError();
    }
    const active: ResolvedGatewayMcpActiveTurn = Object.freeze({
      ...input,
      executionId: this.uuid(),
    });
    this.activeTurnsByConversation.set(input.conversationId, active);
    return active;
  }

  /** Reads a live turn at actual MCP tool execution time, never at HTTP handler construction time. */
  resolveActive(mcpTransportToken: string, conversationId: string): ResolvedGatewayMcpActiveTurn {
    const process = this.authenticate(mcpTransportToken);
    const active = this.activeTurnsByConversation.get(conversationId);
    if (!active || active.installationId !== process.installationId || active.gatewayInstanceId !== process.gatewayInstanceId) {
      throw new GatewayMcpActiveTurnInactiveError();
    }
    return active;
  }

  /** Exact terminal only: an old terminal can never clear a newer turn. */
  deactivateTurn(input: Pick<GatewayMcpActiveTurnInput, 'installationId' | 'gatewayInstanceId' | 'conversationId' | 'turnId'>): void {
    const active = this.activeTurnsByConversation.get(input.conversationId);
    if (
      active
      && active.installationId === input.installationId
      && active.gatewayInstanceId === input.gatewayInstanceId
      && active.turnId === input.turnId
    ) {
      this.activeTurnsByConversation.delete(input.conversationId);
    }
  }

  /** Gateway loss discards the bearer and every active-turn authority record. */
  disconnect(gatewayInstanceId: string): void {
    if (this.currentProcess?.gatewayInstanceId !== gatewayInstanceId) return;
    this.clear();
  }

  private requireCurrentProcess(input: Pick<GatewayMcpActiveTurnInput, 'installationId' | 'gatewayInstanceId'>): void {
    const current = this.currentProcess;
    if (!current || current.installationId !== input.installationId || current.gatewayInstanceId !== input.gatewayInstanceId) {
      throw new GatewayMcpTransportInvalidError();
    }
  }

  private clear(): void {
    this.processesByToken.clear();
    this.activeTurnsByConversation.clear();
    this.currentProcess = null;
  }
}

function sameToken(raw: string, expected: Buffer): boolean {
  const candidate = Buffer.from(raw, 'utf8');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sameTurn(
  active: ResolvedGatewayMcpActiveTurn,
  input: GatewayMcpActiveTurnInput,
): boolean {
  return active.installationId === input.installationId
    && active.gatewayInstanceId === input.gatewayInstanceId
    && active.organizationId === input.organizationId
    && active.initiatingUserId === input.initiatingUserId
    && active.conversationId === input.conversationId
    && active.turnId === input.turnId;
}
