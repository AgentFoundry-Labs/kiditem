import { createHash } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AgentResultEnvelopeSchema,
  type AgentResultEnvelope,
} from "@kiditem/shared/agent-interaction";
import { AgentOsRuntimeError } from "../../../domain/agent-os.errors";
import type {
  InvocationAuthorizationInput,
  InvocationAuthorizationResult,
  InlineInvocationFinalizeInput,
} from "../../port/out/work/agent-work-persistence.types";
import type { AgentWorkInvocationApprovalPort } from "../../port/out/work/agent-work-invocation-approval.port";
import { AgentCapabilityRegistry } from "../agent-capability-registry.service";
import { MUTATION_EFFECTS } from "../../../domain/capability/capability-definition";
import type { SourcingCapabilityAdmissionPort } from "../../../../sourcing/application/port/in/capability/sourcing-capability-admission.port";

type PublicAuthorizationInput = Pick<
  InvocationAuthorizationInput,
  | "organizationId"
  | "sessionId"
  | "taskId"
  | "attemptId"
  | "agentVersionId"
  | "initiatingUserId"
  | "capabilityKey"
  | "authorizationKind"
  | "authorizationExpiresAt"
  | "ownerIdempotencyKey"
> & { input: unknown; approvalExpiresAt?: Date };

export class AgentCapabilityInvocationService {
  constructor(
    private readonly transactions: AgentWorkInvocationApprovalPort,
    private readonly capabilities: Pick<
      AgentCapabilityRegistry,
      "resolveDefinition"
      | "resolveImplementation"
    >,
    private readonly now: () => Date = () => new Date(),
    private readonly sourcingAdmission?: Pick<SourcingCapabilityAdmissionPort, "admit">,
  ) {}

  async authorize(
    input: PublicAuthorizationInput,
  ): Promise<InvocationAuthorizationResult> {
    const now = this.now();
    if (input.authorizationExpiresAt <= now)
      throw new AgentOsRuntimeError(
        "authorization_expired",
        "authorization_expired",
      );
    const definition = this.capabilities.resolveDefinition(input.capabilityKey);
    if (!definition)
      throw new AgentOsRuntimeError(
        "capability_not_found",
        "capability_not_found",
      );
    let parsed: unknown;
    try {
      parsed = definition.inputSchema.parse(input.input);
    } catch {
      throw new AgentOsRuntimeError(
        "capability_input_invalid",
        "capability_input_invalid",
      );
    }
    const canonicalInput = canonicalize(parsed);
    const inputHash = hash(canonicalInput);
    const mutation = definition.effects.some((effect) =>
      MUTATION_EFFECTS.has(effect),
    );
    const approvalNeeded =
      mutation && ["medium", "high"].includes(definition.approvalRisk);
    if (mutation && !input.ownerIdempotencyKey) {
      throw new AgentOsRuntimeError(
        "owner_idempotency_key_required",
        "owner_idempotency_key_required",
      );
    }
    await this.sourcingAdmission?.admit({
      capabilityKey: input.capabilityKey,
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      attemptId: input.attemptId,
      input: parsed,
    });
    return this.transactions.authorizeInvocation({
      ...input,
      ownerDomain: definition.ownerDomain,
      effects: definition.effects,
      approvalRisk: definition.approvalRisk,
      idempotencyRequirement: definition.idempotency,
      capabilityContractFingerprint: capabilityContractFingerprint(definition),
      canonicalInput: mutation ? canonicalInput : undefined,
      inputHash,
      initialStatus: mutation
        ? approvalNeeded
          ? "approval_pending"
          : "ready"
        : "authorized",
      approval: approvalNeeded
        ? {
            inputHash,
            status: "pending",
            expiresAt: new Date(
              Math.min(
                (
                  input.approvalExpiresAt ?? input.authorizationExpiresAt
                ).getTime(),
                input.authorizationExpiresAt.getTime(),
                now.getTime() + 24 * 60 * 60 * 1000,
              ),
            ),
            createdAt: now,
          }
        : undefined,
    });
  }

  /**
   * Read-only capabilities run in the live CLI process.  Authorization and
   * its durable completion are deliberately separate fences: a restart can
   * mark an unfinished read failed and a late process may not overwrite it.
   */
  async invoke(input: PublicAuthorizationInput): Promise<
    InvocationAuthorizationResult | { invocation: InvocationAuthorizationResult; result: AgentResultEnvelope }
  > {
    const authorization = await this.authorize(input);
    const definition = this.capabilities.resolveDefinition(input.capabilityKey);
    if (!definition) throw new AgentOsRuntimeError("capability_not_found", "capability_not_found");
    const mutation = definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
    if (mutation) return authorization;

    const implementation = this.capabilities.resolveImplementation(input.capabilityKey);
    if (!implementation || implementation.capabilityKey !== input.capabilityKey) {
      await this.finishInline({
        organizationId: input.organizationId,
        invocationId: authorization.invocationId,
        outcome: "failed",
        error: { code: "stale_capability_version", message: "Capability implementation is unavailable." },
        finishedAt: this.now(),
      });
      throw new AgentOsRuntimeError("stale_capability_version", "stale_capability_version");
    }

    try {
      const parsed = definition.inputSchema.parse(input.input);
      const result = AgentResultEnvelopeSchema.parse(await implementation.invoke({
        context: {
          organizationId: input.organizationId,
          initiatingUserId: input.initiatingUserId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          attemptId: input.attemptId,
          agentVersionId: input.agentVersionId,
          ownerIdempotencyKey: input.ownerIdempotencyKey,
          applicationVersion: authorization.applicationVersion,
          authorizingGitSha: authorization.authorizingGitSha,
          runtimeType: authorization.runtimeType,
        },
        input: parsed,
      }));
      if (result.output !== undefined) definition.outputSchema.parse(result.output);
      const completed = await this.finishInline({
        organizationId: input.organizationId,
        invocationId: authorization.invocationId,
        outcome: "succeeded",
        result: concise(result),
        finishedAt: this.now(),
      });
      if (!completed.won) throw new AgentOsRuntimeError("attempt_not_live", "inline_invocation_interrupted");
      return { invocation: authorization, result };
    } catch (error) {
      if (error instanceof AgentOsRuntimeError) throw error;
      await this.finishInline({
        organizationId: input.organizationId,
        invocationId: authorization.invocationId,
        outcome: "failed",
        error: inlineError(error),
        finishedAt: this.now(),
      });
      throw error;
    }
  }

  private finishInline(input: InlineInvocationFinalizeInput): Promise<{ won: boolean }> {
    return this.transactions.finalizeInlineInvocation(input);
  }
}

function concise(result: AgentResultEnvelope): AgentResultEnvelope {
  return {
    ...result,
    summary: result.summary.slice(0, 1_000),
    resourceRefs: result.resourceRefs.slice(0, 50),
    operationRefs: result.operationRefs.slice(0, 50),
  };
}

function inlineError(error: unknown): { code: string; message: string } {
  return {
    code: "capability_execution_failed",
    message: error instanceof Error ? error.message.slice(0, 1_000) : "Capability execution failed.",
  };
}

export function canonicalize(input: unknown): unknown {
  const seen = new WeakSet<object>();
  return canonical(input, seen);
}

function canonical(input: unknown, seen: WeakSet<object>): unknown {
  if (input === null || typeof input === "string" || typeof input === "boolean")
    return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw invalidJson();
    return input;
  }
  if (Array.isArray(input)) {
    if (seen.has(input)) throw invalidJson();
    seen.add(input);
    const result = input.map((value) => canonical(value, seen));
    seen.delete(input);
    return result;
  }
  if (input && typeof input === "object") {
    if (seen.has(input)) throw invalidJson();
    seen.add(input);
    if (Object.getPrototypeOf(input) !== Object.prototype) throw invalidJson();
    const result = Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, value]) => [key, canonical(value, seen)]),
    );
    seen.delete(input);
    return result;
  }
  throw invalidJson();
}

function invalidJson(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    "invalid_canonical_json",
    "invalid_canonical_json",
  );
}

export function hash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Shared with durable dispatch so authorization and execution fence one contract. */
export function capabilityContractFingerprint(definition: {
  key: string;
  ownerDomain: string;
  effects: readonly string[];
  approvalRisk: string;
  idempotency: string;
  ownerInputPort: string;
  inputSchema: unknown;
  outputSchema: unknown;
}): string {
  return hash({
    key: definition.key,
    ownerDomain: definition.ownerDomain,
    effects: definition.effects,
    approvalRisk: definition.approvalRisk,
    idempotency: definition.idempotency,
    ownerInputPort: definition.ownerInputPort,
    inputSchema: zodToJsonSchema(definition.inputSchema as never),
    outputSchema: zodToJsonSchema(definition.outputSchema as never),
  });
}
