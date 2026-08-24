import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaAgentWorkTransaction } from "../adapter/out/transaction/work/prisma-agent-work.transaction";
import { PrismaAgentWorkRepository } from "../adapter/out/repository/work/prisma-agent-work.repository";
import { AgentAttemptCapacityService } from "../application/service/work/agent-attempt-capacity.service";
import { AgentAttemptAdmissionService } from "../application/service/work/agent-attempt-admission.service";
import { AgentTaskDelegationService } from "../application/service/work/agent-task-delegation.service";
import { AgentLiveMessageService } from "../application/service/work/agent-live-message.service";
import { AgentCapabilityInvocationService } from "../application/service/work/agent-capability-invocation.service";

const organizationId = "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const userId = "e1234567-89ab-4cde-8f01-23456789abc1";
let prisma: PrismaClient;
let work: PrismaAgentWorkTransaction;
let repository: PrismaAgentWorkRepository;
let versionNumber = 0;
let invocationNumber = 0;

const snapshot = {
  input: {},
  applicationVersion: "1.0.0",
  authorizingGitSha: "a".repeat(40),
  cliVersion: "1.0.0",
};

beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  work = new PrismaAgentWorkTransaction(prisma);
  repository = new PrismaAgentWorkRepository(prisma);
  await prisma.$connect();
});
afterAll(async () => prisma.$disconnect());
beforeEach(async () => {
  versionNumber = 0;
  invocationNumber = 0;
  await prisma.agentCapabilityApproval.deleteMany({
    where: { organizationId },
  });
  await prisma.agentCapabilityInvocation.deleteMany({
    where: { organizationId },
  });
  await prisma.agentTask.updateMany({
    where: { organizationId },
    data: { delegatedFromAttemptId: null },
  });
  await prisma.agentTask.deleteMany({ where: { organizationId } });
  await prisma.agentAttempt.deleteMany({ where: { organizationId } });
  await prisma.agentSession.deleteMany({ where: { organizationId } });
  await prisma.agentVersion.deleteMany({
    where: { agentDefinitionKey: { startsWith: "admission_race_test" } },
  });
  await prisma.organizationMembership.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.organization.create({
    data: { id: organizationId, name: "Races", slug: "agent-work-races" },
  });
  await prisma.user.create({
    data: { id: userId, email: "races@test.local", name: "Racer" },
  });
  await prisma.organizationMembership.create({
    data: { organizationId, userId, status: "active" },
  });
});

async function createVersion(overrides: {
  agentDefinitionKey?: string;
  assignedDomains?: string[];
  capabilityKeys?: string[];
  activatedAt?: Date | null;
  runtimeType?: string;
  instructionProfileRef?: string;
} = {}) {
  versionNumber += 1;
  return prisma.agentVersion.create({
    data: {
      agentDefinitionKey:
        overrides.agentDefinitionKey ?? `admission_race_test_${versionNumber}`,
      version: versionNumber,
      assignedDomains: overrides.assignedDomains ?? ["agent_os"],
      capabilityKeys: overrides.capabilityKeys ?? [],
      runtimeType: overrides.runtimeType ?? "codex_cli",
      instructionProfileRef: overrides.instructionProfileRef ?? "operator/v1",
      manifestHash: String(versionNumber).padStart(64, "b"),
      activatedAt: overrides.activatedAt === undefined ? new Date() : overrides.activatedAt,
    },
  });
}

async function liveRoot(version?: Awaited<ReturnType<typeof createVersion>>) {
  const selectedVersion = version ?? (await createVersion());
  const root = await work.admitRootAttempt({
    organizationId,
    createdByUserId: userId,
    assignedAgentVersionId: selectedVersion.id,
    objective: "Test",
    completionCriteria: "Done",
    inputResourceRefs: [],
    ...snapshot,
  });
  return { ...root, version: selectedVersion };
}

async function terminalRoot() {
  const root = await liveRoot();
  await prisma.agentAttempt.update({
    where: { id: root.attempt.id },
    data: { status: "succeeded", finishedAt: new Date() },
  });
  return root;
}

async function createInvocation(input: {
  root: Awaited<ReturnType<typeof liveRoot>>;
  status: "authorized" | "approval_pending" | "ready" | "executing";
  effects: string[];
  approval?: boolean;
  authorizationKind?: "agent_default_scope" | "cross_domain_read_grant" | "explicit_execution_grant";
}) {
  invocationNumber += 1;
  const inputHash = String(invocationNumber).padStart(64, "a");
  return prisma.agentCapabilityInvocation.create({
    data: {
      organizationId,
      sessionId: input.root.session.id,
      taskId: input.root.task.id,
      attemptId: input.root.attempt.id,
      agentVersionId: input.root.version.id,
      initiatingUserId: userId,
      capabilityKey: `agent.capability.${invocationNumber}`,
      ownerDomain: "agent_os",
      authorizationKind: input.authorizationKind ?? "agent_default_scope",
      authorizationExpiresAt: new Date(Date.now() + 60_000),
      inputHash,
      canonicalInput: input.effects.some((effect) => effect !== "read") ? {} : undefined,
      effects: input.effects,
      approvalRisk: input.approval ? "medium" : "none",
      idempotencyRequirement: input.effects.some((effect) => effect !== "read") ? "required" : "none",
      ownerIdempotencyKey: input.effects.some((effect) => effect !== "read") ? `key-${invocationNumber}` : undefined,
      applicationVersion: "1.0.0",
      authorizingGitSha: "a".repeat(40),
      capabilityContractFingerprint: String(invocationNumber).padStart(64, "c"),
      runtimeType: input.root.version.runtimeType,
      status: input.status,
      approval: input.approval
        ? {
            create: {
              inputHash,
              status: "pending",
              expiresAt: new Date(Date.now() + 30_000),
            },
          }
        : undefined,
    },
    include: { approval: true },
  });
}

describe("replacement Agent work transaction races", () => {
  it("matrix 1: atomically admits only an active pinned root runtime and rolls back unpublished work", async () => {
    const active = await createVersion({
      runtimeType: "claude_cli",
      instructionProfileRef: "pinned/profile",
    });
    const admitted = await work.admitRootAttempt({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: active.id,
      objective: "Pinned",
      completionCriteria: "Uses pinned runtime",
      inputResourceRefs: [],
      ...snapshot,
    });
    await expect(
      prisma.agentAttempt.findUnique({
        where: { id: admitted.attempt.id },
        select: { runtimeType: true, instructionProfileRef: true },
      }),
    ).resolves.toEqual({
      runtimeType: "claude_cli",
      instructionProfileRef: "pinned/profile",
    });
    expect(await prisma.agentSession.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.agentTask.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.agentAttempt.count({ where: { organizationId } })).toBe(1);

    const unpublished = await createVersion({ activatedAt: null });
    await expect(
      work.admitRootAttempt({
        organizationId,
        createdByUserId: userId,
        assignedAgentVersionId: unpublished.id,
        objective: "Unpublished",
        completionCriteria: "Never admitted",
        inputResourceRefs: [],
        ...snapshot,
      }),
    ).rejects.toMatchObject({ code: "agent_version_not_active" });
    expect(await prisma.agentSession.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.agentTask.count({ where: { organizationId } })).toBe(1);
    expect(await prisma.agentAttempt.count({ where: { organizationId } })).toBe(1);
  });

  it("matrix 2: admits four local attempts, rejects a fifth without a row, and reuses a released lease", async () => {
    const capacity = new AgentAttemptCapacityService(4);
    const admissions = new AgentAttemptAdmissionService(capacity, work);
    const roots = await Promise.all(
      Array.from({ length: 4 }, (_, index) => {
        const version = createVersion();
        return version.then((created) =>
          admissions.root({
            organizationId,
            createdByUserId: userId,
            assignedAgentVersionId: created.id,
            objective: `Root ${index}`,
            completionCriteria: "Live",
            inputResourceRefs: [],
            ...snapshot,
          }),
        );
      }),
    );
    const fifthVersion = await createVersion();
    await expect(
      admissions.root({
        organizationId,
        createdByUserId: userId,
        assignedAgentVersionId: fifthVersion.id,
        objective: "Fifth",
        completionCriteria: "Rejected",
        inputResourceRefs: [],
        ...snapshot,
      }),
    ).rejects.toMatchObject({ code: "agent_capacity_exhausted" });
    expect(await prisma.agentAttempt.count({ where: { organizationId } })).toBe(4);
    admissions.releaseAttempt(roots[0].attempt.id);
    const replacement = await admissions.root({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: fifthVersion.id,
      objective: "Replacement",
      completionCriteria: "Accepted",
      inputResourceRefs: [],
      ...snapshot,
    });
    expect(replacement.attempt.ordinal).toBe(1);
    expect(await prisma.agentAttempt.count({ where: { organizationId } })).toBe(5);
  });

  it("matrix 3: concurrent admission service follow-ups have one winner and release the loser's provisional slot", async () => {
    const root = await terminalRoot();
    const capacity = new AgentAttemptCapacityService(2);
    const admissions = new AgentAttemptAdmissionService(capacity, work);
    const input = {
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      requestedByUserId: userId,
      predecessorAttemptId: root.attempt.id,
      ...snapshot,
    };
    const raced = await Promise.allSettled([
      admissions.followUp(input),
      admissions.followUp(input),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = raced.find((result) => result.status === "rejected");
    expect(loser).toMatchObject({ reason: { code: "attempt_already_running" } });
    expect(await prisma.agentAttempt.count({ where: { taskId: root.task.id, status: { in: ["starting", "running"] } } })).toBe(1);
    const reusable = capacity.tryReserve();
    reusable.release();
  });

  it("matrix 4: terminal follow-up semantics atomically reopen only the current predecessor", async () => {
    const root = await terminalRoot();
    let predecessorAttemptId = root.attempt.id;
    for (const status of ["completed", "failed"] as const) {
      await prisma.agentTask.update({
        where: { id: root.task.id },
        data: { status, finishedAt: new Date() },
      });
      const successor = await work.admitAttempt({
        organizationId,
        sessionId: root.session.id,
        taskId: root.task.id,
        requestedByUserId: userId,
        predecessorAttemptId,
        intent: status === "completed" ? "follow_up" : "retry",
        ...snapshot,
      });
      expect(successor.ordinal).toBe(status === "completed" ? 2 : 3);
      await prisma.agentAttempt.update({
        where: { id: successor.attemptId },
        data: { status: "failed", finishedAt: new Date() },
      });
      predecessorAttemptId = successor.attemptId;
      await prisma.agentTask.update({
        where: { id: root.task.id },
        data: { status: "failed", finishedAt: new Date() },
      });
    }
    await expect(
      work.admitAttempt({
        organizationId,
        sessionId: root.session.id,
        taskId: root.task.id,
        requestedByUserId: userId,
        predecessorAttemptId: root.attempt.id,
        intent: "retry",
        ...snapshot,
      }),
    ).rejects.toMatchObject({ code: "attempt_predecessor_stale" });
    const latest = await prisma.agentAttempt.findFirstOrThrow({
      where: { taskId: root.task.id }, orderBy: { ordinal: "desc" },
    });
    await prisma.agentTask.update({
      where: { id: root.task.id },
      data: { status: "cancelled", finishedAt: new Date() },
    });
    await expect(work.admitAttempt({ ...snapshot, organizationId, sessionId: root.session.id, taskId: root.task.id, requestedByUserId: userId, predecessorAttemptId: latest.id }))
      .rejects.toMatchObject({ code: "task_not_open" });
    const reopened = await work.admitAttempt({
      ...snapshot,
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      requestedByUserId: userId,
      predecessorAttemptId: latest.id,
      intent: "reopen",
    });
    expect(reopened.ordinal).toBe(4);
    await expect(prisma.agentTask.findUnique({ where: { id: root.task.id }, select: { status: true, finishedAt: true } }))
      .resolves.toEqual({ status: "open", finishedAt: null });
  });

  it("matrix 5: only the current owner with an active membership and exact live attempt receives a process-memory message", async () => {
    const root = await liveRoot();
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const messages = new AgentLiveMessageService(delivery, repository);
    const input = {
      organizationId,
      requestedByUserId: userId,
      sessionId: root.session.id,
      taskId: root.task.id,
      attemptId: root.attempt.id,
      content: "continue",
    };
    await messages.send(input);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
    expect(await prisma.agentAttempt.count({ where: { taskId: root.task.id } })).toBe(1);

    const wrongActor = "e1234567-89ab-4cde-8f01-23456789abce";
    await prisma.user.create({ data: { id: wrongActor, email: "wrong@test.local", name: "Wrong" } });
    await prisma.organizationMembership.create({ data: { organizationId, userId: wrongActor, status: "active" } });
    await expect(messages.send({ ...input, requestedByUserId: wrongActor })).rejects.toMatchObject({ code: "task_not_found" });
    await prisma.organizationMembership.updateMany({ where: { organizationId, userId }, data: { status: "inactive" } });
    await expect(messages.send(input)).rejects.toMatchObject({ code: "task_not_found" });
    await prisma.organizationMembership.updateMany({ where: { organizationId, userId }, data: { status: "active" } });
    await prisma.agentAttempt.update({ where: { id: root.attempt.id }, data: { status: "succeeded", finishedAt: new Date() } });
    await expect(messages.send(input)).rejects.toMatchObject({ code: "attempt_not_live" });
    for (const status of ["completed", "failed", "cancelled"] as const) {
      await prisma.agentTask.update({ where: { id: root.task.id }, data: { status, finishedAt: new Date() } });
      await expect(messages.send(input)).rejects.toMatchObject({
        code: status === "cancelled" ? "task_cancelled" : "task_not_open",
      });
    }
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
  });

  it("matrix 6: live-parent delegation is atomic, pinned, idempotent, and capacity-safe on conflict", async () => {
    const parentVersion = await createVersion();
    const targetVersion = await createVersion({
      runtimeType: "claude_cli",
      instructionProfileRef: "target/pinned",
    });
    const parent = await liveRoot(parentVersion);
    const capacity = new AgentAttemptCapacityService(2);
    const delegation = new AgentTaskDelegationService(
      repository,
      new AgentAttemptAdmissionService(capacity, work),
    );
    const input = {
      organizationId,
      sessionId: parent.session.id,
      parentTaskId: parent.task.id,
      delegatingAttemptId: parent.attempt.id,
      requestedByUserId: userId,
      targetAgentVersionId: targetVersion.id,
      objective: "Child",
      completionCriteria: "Done",
      inputResourceRefs: [{ kind: "product", id: "1" }],
      idempotencyKey: "delegate-1",
      input: { a: 1 },
      applicationVersion: "1.0.0",
      authorizingGitSha: "a".repeat(40),
      cliVersion: "1.0.0",
    };
    const first = await delegation.delegate(input);
    expect(first.replayed).toBe(false);
    await expect(prisma.agentAttempt.findUnique({ where: { id: first.firstAttemptId }, select: { runtimeType: true, instructionProfileRef: true } }))
      .resolves.toEqual({ runtimeType: "claude_cli", instructionProfileRef: "target/pinned" });
    await expect(delegation.delegate(input)).resolves.toEqual({ ...first, replayed: true });
    expect(await prisma.agentTask.count({ where: { sessionId: parent.session.id } })).toBe(2);
    expect(await prisma.agentAttempt.count({ where: { sessionId: parent.session.id } })).toBe(2);
    for (const changed of [
      { targetAgentVersionId: parentVersion.id },
      { objective: "Changed" },
      { completionCriteria: "Changed" },
      { inputResourceRefs: [] },
      { input: { a: 2 } },
    ]) {
      await expect(delegation.delegate({ ...input, ...changed })).rejects.toMatchObject({ code: "delegation_idempotency_conflict" });
    }
    const reusable = capacity.tryReserve();
    reusable.release();
    await prisma.agentAttempt.update({ where: { id: parent.attempt.id }, data: { status: "failed", finishedAt: new Date() } });
    await expect(delegation.delegate({ ...input, idempotencyKey: "delegate-parent-not-live" }))
      .rejects.toMatchObject({ code: "delegating_attempt_not_live" });
  });

  it("matrix 6a: direct admission replays an exact delegation before capacity, while changed or new requests still fence capacity and conflict", async () => {
    const parentVersion = await createVersion();
    const targetVersion = await createVersion();
    const parent = await liveRoot(parentVersion);
    const capacity = new AgentAttemptCapacityService(1);
    const admissions = new AgentAttemptAdmissionService(capacity, work);
    const input = {
      organizationId,
      sessionId: parent.session.id,
      parentTaskId: parent.task.id,
      delegatingAttemptId: parent.attempt.id,
      requestedByUserId: userId,
      targetAgentVersionId: targetVersion.id,
      objective: "Child",
      completionCriteria: "Done",
      inputResourceRefs: [],
      idempotencyKey: "direct-delegate-1",
      requestHash: "d".repeat(64),
      ...snapshot,
    };
    const first = await admissions.delegate(input);
    await expect(admissions.delegate(input)).resolves.toEqual({ ...first, replayed: true });
    await expect(admissions.delegate({
      ...input,
      requestHash: "f".repeat(64),
    })).rejects.toMatchObject({ code: "delegation_idempotency_conflict" });
    await expect(admissions.delegate({
      ...input,
      idempotencyKey: "direct-delegate-2",
      requestHash: "e".repeat(64),
    })).rejects.toMatchObject({ code: "agent_capacity_exhausted" });

    admissions.releaseAttempt(first.firstAttemptId);
    const reusable = capacity.tryReserve();
    reusable.release();
  });

  it("matrix 7: code-owned capability definitions enforce routing and persist approval snapshots", async () => {
    const rootVersion = await createVersion({
      capabilityKeys: ["agent.inspect", "agent.medium", "agent.high"],
    });
    const root = await liveRoot(rootVersion);
    const definition = (key: string, ownerDomain: "agent_os" | "products", effects: string[], approvalRisk: "none" | "medium" | "high" = "none") => ({
      key,
      ownerDomain,
      description: key,
      inputSchema: z.object({ a: z.number(), b: z.number().optional() }),
      outputSchema: z.object({ ok: z.boolean() }),
      effects,
      approvalRisk,
      idempotency: effects.includes("read") ? "none" : "required",
      ownerInputPort: `${ownerDomain}.${key.split(".")[1]}`,
    });
    const definitions = new Map([
      ["agent.inspect", definition("agent.inspect", "agent_os", ["read"])],
      ["products.inspect", definition("products.inspect", "products", ["read"])],
      ["products.write", definition("products.write", "products", ["db_write"])],
      ["agent.medium", definition("agent.medium", "agent_os", ["db_write"], "medium")],
      ["agent.high", definition("agent.high", "agent_os", ["db_write"], "high")],
    ]);
    const service = new AgentCapabilityInvocationService(
      work,
      { resolveDefinition: (key: string) => definitions.get(key) ?? null } as never,
    );
    const base = {
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      attemptId: root.attempt.id,
      agentVersionId: root.version.id,
      initiatingUserId: userId,
      authorizationExpiresAt: new Date(Date.now() + 60_000),
      input: { b: 2, a: 1 },
    };
    const ownRead = await service.authorize({ ...base, capabilityKey: "agent.inspect", authorizationKind: "agent_default_scope" });
    const crossRead = await service.authorize({ ...base, capabilityKey: "products.inspect", authorizationKind: "cross_domain_read_grant" });
    await expect(service.authorize({ ...base, capabilityKey: "agent.inspect", authorizationKind: "cross_domain_read_grant" }))
      .rejects.toMatchObject({ code: "capability_routing_denied" });
    await expect(service.authorize({ ...base, capabilityKey: "products.write", authorizationKind: "explicit_execution_grant", ownerIdempotencyKey: "root-cross-write" }))
      .rejects.toMatchObject({ code: "capability_routing_denied" });
    await expect(prisma.agentCapabilityInvocation.findMany({ where: { id: { in: [ownRead.invocationId, crossRead.invocationId] } }, select: { id: true, canonicalInput: true, inputHash: true, status: true } }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: ownRead.invocationId, canonicalInput: null, status: "authorized", inputHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        expect.objectContaining({ id: crossRead.invocationId, canonicalInput: null, status: "authorized", inputHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      ]));

    const target = await createVersion({ assignedDomains: ["products"], capabilityKeys: [] });
    const child = await work.delegateTask({
      organizationId,
      sessionId: root.session.id,
      parentTaskId: root.task.id,
      delegatingAttemptId: root.attempt.id,
      requestedByUserId: userId,
      targetAgentVersionId: target.id,
      objective: "Child write",
      completionCriteria: "Done",
      inputResourceRefs: [],
      idempotencyKey: "routing-child",
      requestHash: "r".repeat(64),
      ...snapshot,
    });
    await expect(service.authorize({
      ...base,
      taskId: child.childTaskId,
      attemptId: child.firstAttemptId,
      agentVersionId: target.id,
      capabilityKey: "products.write",
      authorizationKind: "explicit_execution_grant",
      ownerIdempotencyKey: "child-cross-write",
    })).resolves.toMatchObject({ invocationStatus: "ready" });
    const pending = await Promise.all(["agent.medium", "agent.high"].map((capabilityKey) => service.authorize({
      ...base,
      capabilityKey,
      authorizationKind: "agent_default_scope",
      ownerIdempotencyKey: `approval-${capabilityKey}`,
      approvalExpiresAt: new Date(Date.now() + 120_000),
    })));
    const pendingRows = await prisma.agentCapabilityInvocation.findMany({
      where: { id: { in: pending.map((result) => result.invocationId) } },
      include: { approval: true },
    });
    expect(pendingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "approval_pending", canonicalInput: { a: 1, b: 2 }, approval: expect.objectContaining({ status: "pending" }) }),
    ]));
  });

  it("replays a required durable invocation for the same canonical input and rejects owner-key drift", async () => {
    const version = await createVersion({
      assignedDomains: ["products"],
      capabilityKeys: ["products.write"],
    });
    const root = await liveRoot(version);
    const service = new AgentCapabilityInvocationService(
      work,
      {
        resolveDefinition: () => ({
          key: "products.write",
          ownerDomain: "products",
          description: "write",
          inputSchema: z.object({ a: z.number(), z: z.number() }).strict(),
          outputSchema: z.object({ ok: z.boolean() }),
          effects: ["db_write"],
          approvalRisk: "low",
          idempotency: "required",
          ownerInputPort: "products.write",
        }),
      } as never,
    );
    const base = {
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      attemptId: root.attempt.id,
      agentVersionId: root.version.id,
      initiatingUserId: userId,
      capabilityKey: "products.write",
      authorizationKind: "agent_default_scope" as const,
      authorizationExpiresAt: new Date(Date.now() + 60_000),
      ownerIdempotencyKey: "durable-owner-key",
    };

    const first = await service.authorize({ ...base, input: { z: 1, a: 2 } });
    const replay = await service.authorize({ ...base, input: { a: 2, z: 1 } });
    expect(replay).toEqual(first);
    await expect(service.authorize({ ...base, input: { a: 3, z: 1 } }))
      .rejects.toMatchObject({ code: "owner_idempotency_input_conflict" });
    await expect(prisma.agentCapabilityInvocation.count({
      where: { organizationId, capabilityKey: "products.write", ownerIdempotencyKey: "durable-owner-key" },
    })).resolves.toBe(1);
  });

  it("matrix 9: approval decisions, expiry, and their race leave one consistent durable pair", async () => {
    const root = await liveRoot();
    const approved = await createInvocation({ root, status: "approval_pending", effects: ["db_write"], approval: true });
    await expect(work.decideApproval({
      organizationId, sessionId: root.session.id, invocationId: approved.id, approvalId: approved.approval!.id,
      inputHash: approved.inputHash, decision: "approved", decidedByUserId: userId, decidedAt: new Date(),
    })).resolves.toEqual({ approvalStatus: "approved", invocationStatus: "ready" });
    await expect(work.decideApproval({
      organizationId, sessionId: root.session.id, invocationId: approved.id, approvalId: approved.approval!.id,
      inputHash: approved.inputHash, decision: "approved", decidedByUserId: userId, decidedAt: new Date(),
    })).rejects.toMatchObject({ code: "approval_context_changed" });
    const rejected = await createInvocation({ root, status: "approval_pending", effects: ["db_write"], approval: true });
    await expect(work.decideApproval({
      organizationId, sessionId: root.session.id, invocationId: rejected.id, approvalId: rejected.approval!.id,
      inputHash: rejected.inputHash, decision: "rejected", decidedByUserId: userId, decidedAt: new Date(),
    })).resolves.toEqual({ approvalStatus: "rejected", invocationStatus: "failed" });
    const guarded = await createInvocation({ root, status: "approval_pending", effects: ["db_write"], approval: true });
    const guardedBefore = await prisma.agentCapabilityInvocation.findUniqueOrThrow({ where: { id: guarded.id }, include: { approval: true } });
    await expect(work.decideApproval({
      organizationId, sessionId: root.session.id, invocationId: guarded.id, approvalId: guarded.approval!.id,
      inputHash: "x".repeat(64), decision: "approved", decidedByUserId: userId, decidedAt: new Date(),
    })).rejects.toMatchObject({ code: "approval_context_changed" });
    await expect(prisma.agentCapabilityInvocation.findUnique({ where: { id: guarded.id }, include: { approval: true } })).resolves.toMatchObject({
      status: guardedBefore.status,
      approval: { status: guardedBefore.approval?.status },
    });
    await prisma.agentCapabilityInvocation.update({ where: { id: guarded.id }, data: { authorizationExpiresAt: new Date(Date.now() - 1) } });
    const authExpiredBefore = await prisma.agentCapabilityInvocation.findUniqueOrThrow({ where: { id: guarded.id }, include: { approval: true } });
    await expect(work.decideApproval({
      organizationId, sessionId: root.session.id, invocationId: guarded.id, approvalId: guarded.approval!.id,
      inputHash: guarded.inputHash, decision: "approved", decidedByUserId: userId, decidedAt: new Date(),
    })).rejects.toMatchObject({ code: "approval_expired" });
    await expect(prisma.agentCapabilityInvocation.findUnique({ where: { id: guarded.id }, include: { approval: true } })).resolves.toMatchObject({
      status: authExpiredBefore.status,
      approval: { status: authExpiredBefore.approval?.status },
    });
    const raced = await createInvocation({ root, status: "approval_pending", effects: ["db_write"], approval: true });
    const expiresAt = new Date(Date.now() + 30_000);
    await prisma.agentCapabilityApproval.update({ where: { id: raced.approval!.id }, data: { expiresAt } });
    const decisions = await Promise.allSettled([
      work.decideApproval({ organizationId, sessionId: root.session.id, invocationId: raced.id, approvalId: raced.approval!.id, inputHash: raced.inputHash, decision: "approved", decidedByUserId: userId, decidedAt: new Date() }),
      work.expireApproval({ organizationId, sessionId: root.session.id, invocationId: raced.id, approvalId: raced.approval!.id, inputHash: raced.inputHash, expiredAt: expiresAt }),
    ]);
    const stateWinners = [
      decisions[0].status === "fulfilled" ? "decision" : null,
      decisions[1].status === "fulfilled" && decisions[1].value.won ? "expiry" : null,
    ].filter(Boolean);
    expect(stateWinners).toHaveLength(1);
    const finalPair = await prisma.agentCapabilityInvocation.findUniqueOrThrow({ where: { id: raced.id }, include: { approval: true } });
    expect([
      ["approved", "ready"], ["rejected", "failed"], ["expired", "failed"],
    ]).toContainEqual([finalPair.approval?.status, finalPair.status]);
  });

  it("matrix 10: cancelling one task closes only cancellable work and rejects ordinary continuation", async () => {
    const root = await liveRoot();
    const authorizedRead = await createInvocation({ root, status: "authorized", effects: ["read"] });
    const executingRead = await createInvocation({ root, status: "executing", effects: ["read"] });
    const pendingMutation = await createInvocation({ root, status: "approval_pending", effects: ["db_write"], approval: true });
    const readyMutation = await createInvocation({ root, status: "ready", effects: ["db_write"] });
    const executingMutation = await createInvocation({ root, status: "executing", effects: ["db_write"] });
    const executingMixedMutation = await createInvocation({ root, status: "executing", effects: ["read", "db_write"] });
    const malformedExecuting = await createInvocation({ root, status: "executing", effects: ["unknown_effect"] });
    await work.transitionTask({ organizationId, sessionId: root.session.id, taskId: root.task.id, requestedByUserId: userId, to: "cancelled", at: new Date() });
    const states = await prisma.agentCapabilityInvocation.findMany({ where: { id: { in: [authorizedRead.id, executingRead.id, pendingMutation.id, readyMutation.id, executingMutation.id, executingMixedMutation.id, malformedExecuting.id] } }, select: { id: true, status: true, error: true } });
    expect(states).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: authorizedRead.id, status: "failed", error: { code: "task_cancelled", message: "Task cancelled." } }),
      expect.objectContaining({ id: executingRead.id, status: "failed", error: { code: "task_cancelled", message: "Task cancelled." } }),
      expect.objectContaining({ id: pendingMutation.id, status: "failed", error: { code: "task_cancelled", message: "Task cancelled." } }),
      expect.objectContaining({ id: readyMutation.id, status: "ready", error: null }),
      expect.objectContaining({ id: executingMutation.id, status: "executing", error: null }),
      expect.objectContaining({ id: executingMixedMutation.id, status: "executing", error: null }),
      expect.objectContaining({ id: malformedExecuting.id, status: "executing", error: null }),
    ]));
    await expect(prisma.agentCapabilityApproval.findUnique({ where: { id: pendingMutation.approval!.id }, select: { status: true } })).resolves.toEqual({ status: "expired" });
    await expect(prisma.agentAttempt.findUnique({ where: { id: root.attempt.id }, select: { status: true } })).resolves.toEqual({ status: "cancelled" });
    await expect(work.admitAttempt({ ...snapshot, organizationId, sessionId: root.session.id, taskId: root.task.id, requestedByUserId: userId, predecessorAttemptId: root.attempt.id }))
      .rejects.toMatchObject({ code: "task_not_open" });
    const delivery = { deliver: vi.fn() };
    await expect(new AgentLiveMessageService(delivery, repository).send({ organizationId, requestedByUserId: userId, sessionId: root.session.id, taskId: root.task.id, attemptId: root.attempt.id, content: "continue" }))
      .rejects.toMatchObject({ code: "task_cancelled" });
    expect(delivery.deliver).not.toHaveBeenCalled();
  });

  it("matrix 11: completed and failed transitions fence every pending category while process failure alone leaves work open", async () => {
    const blockers = ["live_attempt", "authorized_read", "ready_mutation", "open_child"] as const;
    for (const [index, blocker] of blockers.entries()) {
      const root = await terminalRoot();
      if (blocker === "live_attempt") {
        await prisma.agentAttempt.update({ where: { id: root.attempt.id }, data: { status: "running", finishedAt: null } });
      } else if (blocker === "authorized_read") {
        await createInvocation({ root, status: "authorized", effects: ["read"] });
      } else if (blocker === "ready_mutation") {
        await createInvocation({ root, status: "ready", effects: ["db_write"] });
      } else {
        await prisma.agentAttempt.update({ where: { id: root.attempt.id }, data: { status: "running", finishedAt: null } });
        const target = await createVersion();
        const child = await work.delegateTask({
          organizationId, sessionId: root.session.id, parentTaskId: root.task.id, delegatingAttemptId: root.attempt.id,
          requestedByUserId: userId, targetAgentVersionId: target.id, objective: "Child", completionCriteria: "Done",
          inputResourceRefs: [], idempotencyKey: `blocker-${index}`, requestHash: String(index).padStart(64, "b"), ...snapshot,
        });
        await prisma.agentAttempt.update({ where: { id: root.attempt.id }, data: { status: "failed", finishedAt: new Date() } });
        await prisma.agentAttempt.update({ where: { id: child.firstAttemptId }, data: { status: "failed", finishedAt: new Date() } });
      }
      const to = index % 2 === 0 ? "completed" : "failed";
      await expect(work.transitionTask({ organizationId, sessionId: root.session.id, taskId: root.task.id, requestedByUserId: userId, to, at: new Date() }))
        .rejects.toMatchObject({ code: "task_pending_work" });
      if (blocker === "live_attempt") {
        await prisma.agentAttempt.update({ where: { id: root.attempt.id }, data: { status: "failed", finishedAt: new Date() } });
      } else if (blocker === "authorized_read" || blocker === "ready_mutation") {
        await prisma.agentCapabilityInvocation.updateMany({ where: { taskId: root.task.id }, data: { status: "failed", finishedAt: new Date() } });
      } else {
        await prisma.agentTask.updateMany({ where: { parentTaskId: root.task.id }, data: { status: "completed", finishedAt: new Date() } });
      }
      await expect(work.transitionTask({ organizationId, sessionId: root.session.id, taskId: root.task.id, requestedByUserId: userId, to, at: new Date() }))
        .resolves.toEqual({ status: to });
    }
    const processOnly = await terminalRoot();
    await expect(prisma.agentTask.findUnique({ where: { id: processOnly.task.id }, select: { status: true } })).resolves.toEqual({ status: "open" });
  });

  it("matrix 12: busy deletion preserves each nonterminal category and terminal deletion removes the session graph", async () => {
    const categories = ["open_task", "live_attempt", "authorized", "ready", "executing", "pending_approval"] as const;
    for (const [index, category] of categories.entries()) {
      const root = await terminalRoot();
      await prisma.agentTask.update({ where: { id: root.task.id }, data: { status: "completed", finishedAt: new Date() } });
      if (category === "open_task") {
        await prisma.agentTask.update({ where: { id: root.task.id }, data: { status: "open", finishedAt: null } });
      } else if (category === "live_attempt") {
        await prisma.agentAttempt.update({ where: { id: root.attempt.id }, data: { status: "running", finishedAt: null } });
      } else {
        await createInvocation({ root, status: category === "authorized" ? "authorized" : category === "pending_approval" ? "approval_pending" : category, effects: category === "authorized" ? ["read"] : ["db_write"], approval: category === "pending_approval" });
      }
      await expect(work.deleteTerminalSession({ organizationId, sessionId: root.session.id, deletedByUserId: userId }))
        .rejects.toMatchObject({ code: "session_busy" });
      expect(await prisma.agentSession.count({ where: { id: root.session.id } })).toBe(1);
      expect(index).toBeGreaterThanOrEqual(0);
    }
    const terminal = await terminalRoot();
    await prisma.agentTask.update({ where: { id: terminal.task.id }, data: { status: "completed", finishedAt: new Date() } });
    const terminalInvocation = await createInvocation({ root: terminal, status: "approval_pending", effects: ["db_write"], approval: true });
    await work.decideApproval({
      organizationId, sessionId: terminal.session.id, invocationId: terminalInvocation.id, approvalId: terminalInvocation.approval!.id,
      inputHash: terminalInvocation.inputHash, decision: "rejected", decidedByUserId: userId, decidedAt: new Date(),
    });
    expect(await prisma.agentCapabilityInvocation.count({ where: { sessionId: terminal.session.id } })).toBe(1);
    expect(await prisma.agentCapabilityApproval.count({ where: { sessionId: terminal.session.id } })).toBe(1);
    await expect(work.deleteTerminalSession({ organizationId, sessionId: terminal.session.id, deletedByUserId: userId }))
      .resolves.toEqual({ deleted: true });
    expect(await prisma.agentSession.count({ where: { id: terminal.session.id } })).toBe(0);
    expect(await prisma.agentTask.count({ where: { sessionId: terminal.session.id } })).toBe(0);
    expect(await prisma.agentAttempt.count({ where: { sessionId: terminal.session.id } })).toBe(0);
    expect(await prisma.agentCapabilityInvocation.count({ where: { sessionId: terminal.session.id } })).toBe(0);
    expect(await prisma.agentCapabilityApproval.count({ where: { sessionId: terminal.session.id } })).toBe(0);
    expect(await prisma.agentVersion.count({ where: { id: terminal.version.id } })).toBe(1);
  });
  it("matrix 13: terminal deletion races real admission without orphaning work or leaking a provisional slot", async () => {
    const root = await terminalRoot();
    await prisma.agentTask.update({
      where: { id: root.task.id },
      data: { status: "completed", finishedAt: new Date() },
    });
    const capacity = new AgentAttemptCapacityService(1);
    const admissions = new AgentAttemptAdmissionService(capacity, work);
    const input = {
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      requestedByUserId: userId,
      predecessorAttemptId: root.attempt.id,
      intent: "follow_up" as const,
      ...snapshot,
    };
    const raced = await Promise.allSettled([
      admissions.followUp(input),
      work.deleteTerminalSession({
        organizationId,
        sessionId: root.session.id,
        deletedByUserId: userId,
      }),
    ]);
    expect(raced.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const exists = await prisma.agentSession.findFirst({
      where: { id: root.session.id, organizationId },
    });
    if (!exists) {
      expect(
        await prisma.agentAttempt.count({
          where: { sessionId: root.session.id },
        }),
      ).toBe(0);
      expect(() => capacity.tryReserve()).not.toThrow();
    } else {
      expect(await prisma.agentAttempt.count({ where: { taskId: root.task.id, status: { in: ["starting", "running"] } } })).toBe(1);
      await expect(
        work.deleteTerminalSession({
          organizationId,
          sessionId: root.session.id,
          deletedByUserId: userId,
        }),
      ).rejects.toMatchObject({ code: "session_busy" });
    }
  });
});
