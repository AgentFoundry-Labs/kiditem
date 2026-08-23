import { createHash } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AgentOsRuntimeError } from "../../../domain/agent-os.errors";
import type {
  AgentWorkTransactionPort,
  InvocationAuthorizationInput,
  InvocationAuthorizationResult,
} from "../../port/out/work/agent-work-transaction.port";
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
    private readonly transactions: Pick<
      AgentWorkTransactionPort,
      "authorizeInvocation"
    >,
    private readonly capabilities: Pick<
      AgentCapabilityRegistry,
      "resolveDefinition"
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
      capabilityContractFingerprint: hash({
        key: definition.key,
        ownerDomain: definition.ownerDomain,
        effects: definition.effects,
        approvalRisk: definition.approvalRisk,
        idempotency: definition.idempotency,
        ownerInputPort: definition.ownerInputPort,
        inputSchema: zodToJsonSchema(definition.inputSchema as never),
        outputSchema: zodToJsonSchema(definition.outputSchema as never),
      }),
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
