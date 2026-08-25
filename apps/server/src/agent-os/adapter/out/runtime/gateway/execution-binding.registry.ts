import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/** A live provider turn may use this private MCP ingress for at most four hours. */
export const EXECUTION_BINDING_TTL_MS = 4 * 60 * 60 * 1_000;

export interface ExecutionBindingIssueInput {
  installationId: string;
  organizationId: string;
  initiatingUserId: string;
  conversationId: string;
  turnId: string;
}

export interface IssuedExecutionBinding {
  /** Returned once to the Gateway/provider configuration; never log or persist it. */
  token: string;
  executionId: string;
  expiresAt: Date;
}

export interface ResolvedExecutionBinding {
  executionId: string;
  installationId: string;
  organizationId: string;
  initiatingUserId: string;
  conversationId: string;
  turnId: string;
  expiresAt: Date;
}

export class ExecutionBindingInvalidError extends Error {
  readonly code = 'EXECUTION_BINDING_INVALID';

  constructor() {
    super('EXECUTION_BINDING_INVALID');
    this.name = 'ExecutionBindingInvalidError';
  }
}

interface StoredExecutionBinding extends ResolvedExecutionBinding {
  token: Buffer;
}

/**
 * Process-local authentication and correlation only. This registry carries no
 * capability/delegation authority and deliberately has no timer, persistence,
 * recovery, or renewal mechanism.
 */
@Injectable()
export class ExecutionBindingRegistry {
  private readonly byExecutionId = new Map<string, StoredExecutionBinding>();
  private readonly executionIdByToken = new Map<string, string>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly random = () => randomBytes(32),
    private readonly uuid = () => randomUUID(),
  ) {}

  issue(input: ExecutionBindingIssueInput): IssuedExecutionBinding {
    const issuedAt = this.now();
    const tokenBytes = this.random();
    const token = tokenBytes.toString('base64url');
    const executionId = this.uuid();
    const expiresAt = new Date(issuedAt.getTime() + EXECUTION_BINDING_TTL_MS);
    const entry: StoredExecutionBinding = {
      token: tokenBytes,
      executionId,
      installationId: input.installationId,
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      expiresAt,
    };
    this.byExecutionId.set(executionId, entry);
    this.executionIdByToken.set(token, executionId);
    return { token, executionId, expiresAt };
  }

  /** Resolve and validate the bearer fresh for every MCP HTTP request. */
  resolve(token: string): ResolvedExecutionBinding {
    const executionId = this.executionIdByToken.get(token);
    const entry = executionId ? this.byExecutionId.get(executionId) : undefined;
    if (!entry || !sameToken(token, entry.token)) {
      throw new ExecutionBindingInvalidError();
    }
    if (entry.expiresAt.getTime() <= this.now().getTime()) {
      this.remove(entry);
      throw new ExecutionBindingInvalidError();
    }
    return publicBinding(entry);
  }

  revoke(executionId: string): void {
    const entry = this.byExecutionId.get(executionId);
    if (entry) this.remove(entry);
  }

  /** Gateway terminal/interrupt hook: invalidate one live provider turn. */
  revokeTurn(input: Pick<ExecutionBindingIssueInput, 'installationId' | 'conversationId' | 'turnId'>): void {
    for (const entry of this.byExecutionId.values()) {
      if (
        entry.installationId === input.installationId
        && entry.conversationId === input.conversationId
        && entry.turnId === input.turnId
      ) {
        this.remove(entry);
      }
    }
  }

  /** Gateway disconnect/API-restart hook: invalidate every binding for its installation. */
  revokeInstallation(installationId: string): void {
    for (const entry of this.byExecutionId.values()) {
      if (entry.installationId === installationId) this.remove(entry);
    }
  }

  revokeGatewayDisconnect(installationId: string): void {
    this.revokeInstallation(installationId);
  }

  private remove(entry: StoredExecutionBinding): void {
    this.byExecutionId.delete(entry.executionId);
    this.executionIdByToken.delete(entry.token.toString('base64url'));
  }
}

function sameToken(rawToken: string, expected: Buffer): boolean {
  const candidate = Buffer.from(rawToken, 'base64url');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function publicBinding(entry: StoredExecutionBinding): ResolvedExecutionBinding {
  return {
    executionId: entry.executionId,
    installationId: entry.installationId,
    organizationId: entry.organizationId,
    initiatingUserId: entry.initiatingUserId,
    conversationId: entry.conversationId,
    turnId: entry.turnId,
    expiresAt: entry.expiresAt,
  };
}
