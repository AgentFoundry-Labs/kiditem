import { Inject, Injectable } from "@nestjs/common";
import {
  AgentSessionLifecycleCommandSchema,
  type AgentSessionLifecycleCommand,
} from "@kiditem/shared/agent-interaction";
import { parseAgentSessionName } from "@kiditem/shared/identifiers";
import {
  AGENT_INTERACTION_SESSION_LIFECYCLE_PORT,
  type AgentInteractionSessionLifecycleInput,
  type AgentInteractionSessionLifecyclePort,
  type AgentInteractionSessionLifecycleResult,
} from "../../port/in/interaction/agent-interaction-session-lifecycle.port";
import {
  AGENT_SESSION_TOMBSTONE_HASHER,
  type AgentSessionTombstoneHasherPort,
} from "../../port/out/crypto/agent-session-tombstone-hasher.port";
import {
  AGENT_SESSION_LIFECYCLE_TRANSACTION,
  type AgentSessionLifecycleTransactionPort,
} from "../../port/out/transaction/interaction/agent-session-lifecycle.transaction.port";
import {
  projectAgentSessionRetentionPolicy,
} from "../../../domain/session/agent-session-retention.policy";
import { AgentOsBoundaryError } from "../../../domain/agent-os.errors";

@Injectable()
export class AgentInteractionSessionLifecycleService
  implements AgentInteractionSessionLifecyclePort
{
  constructor(
    @Inject(AGENT_SESSION_LIFECYCLE_TRANSACTION)
    private readonly transactions: AgentSessionLifecycleTransactionPort,
    @Inject(AGENT_SESSION_TOMBSTONE_HASHER)
    private readonly hasher: AgentSessionTombstoneHasherPort,
  ) {}

  async execute(
    unsafeInput: AgentInteractionSessionLifecycleInput,
  ): Promise<AgentInteractionSessionLifecycleResult> {
    const input = parseInput(unsafeInput);
    if (input.command === "delete") return this.delete(input);

    const session = await this.transactions.readSession(input);
    if (!session) throw scope();
    if (input.command === "archive") {
      const archived = await this.transactions.archiveSession({
        ...input,
        terminalAt: new Date(),
      });
      return {
        command: input.command,
        status: "archived",
        retentionDueAt: archived.retentionDueAt.toISOString(),
      };
    }

    const active = input.command === "place_legal_hold";
    await this.transactions.setLegalHold({ ...input, active });
    return {
      command: input.command,
      status: active ? "legal_hold_placed" : "legal_hold_released",
      retentionDueAt: null,
    };
  }

  private async delete(
    input: ParsedLifecycleInput,
  ): Promise<AgentInteractionSessionLifecycleResult> {
    const idempotencyKeyHash = this.hasher.hash({
      domain: "idempotency",
      value: canonical([input.organizationId, input.idempotencyKey]),
    });
    const requestFingerprintHash = this.hasher.hash({
      domain: "request_fingerprint",
      value: canonical([
        input.organizationId,
        input.session,
        input.actorId,
        input.command,
        input.reason,
        input.idempotencyKey,
      ]),
    });
    const retry = await this.transactions.findDeletedTombstone({
      idempotencyKeyHash,
    });
    if (retry) {
      if (
        !this.hasher.matches(
          requestFingerprintHash,
          retry.requestFingerprintHash,
        )
      )
        throw idempotencyConflict();
      return { command: "delete", status: "deleted", retentionDueAt: null };
    }

    const session = await this.transactions.readSession(input);
    if (!session) throw scope();
    if (session.legalHoldAt) throw legalHold();
    const policy = projectAgentSessionRetentionPolicy(
      await this.transactions.readRetentionPolicy(input),
    );
    const result = await this.transactions.deleteSession({
      ...input,
      tombstone: {
        organizationIdHash: this.hasher.hash({
          domain: "organization",
          value: input.organizationId,
        }),
        copilotThreadIdHash: this.hasher.hash({
          domain: "copilot_thread",
          value: session.copilotThreadId,
        }),
        idempotencyKeyHash,
        requestFingerprintHash,
        legalPolicyVersion: policy.legalPolicyVersion,
      },
    });
    if (
      !this.hasher.matches(
        requestFingerprintHash,
        result.requestFingerprintHash,
      )
    )
      throw idempotencyConflict();
    return { command: "delete", status: "deleted", retentionDueAt: null };
  }
}

type ParsedLifecycleInput = Omit<
  AgentInteractionSessionLifecycleInput,
  "session" | "command" | "reason" | "idempotencyKey"
> &
  AgentSessionLifecycleCommand & { sessionId: string };

function parseInput(
  input: AgentInteractionSessionLifecycleInput,
): ParsedLifecycleInput {
  const command = AgentSessionLifecycleCommandSchema.parse({
    session: input.session,
    command: input.command,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  });
  try {
    const session = parseAgentSessionName(command.session);
    if (session.organization !== input.organizationId) throw new Error();
    return {
      organizationId: input.organizationId,
      actorId: input.actorId,
      ...command,
      sessionId: session.session,
    };
  } catch {
    throw scope();
  }
}

function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  throw idempotencyConflict();
}

function scope(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "THREAD_LIFECYCLE_SCOPE_INVALID",
    "The requested session is not available in this organization.",
  );
}
function legalHold(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "THREAD_LEGAL_HOLD",
    "A session under legal hold cannot be deleted.",
  );
}
function idempotencyConflict(): AgentOsBoundaryError {
  return new AgentOsBoundaryError(
    "THREAD_LIFECYCLE_IDEMPOTENCY_CONFLICT",
    "The lifecycle idempotency key was reused with different input.",
  );
}

export { AGENT_INTERACTION_SESSION_LIFECYCLE_PORT };
