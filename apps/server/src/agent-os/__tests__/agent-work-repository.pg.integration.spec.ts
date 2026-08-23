import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaAgentWorkRepository } from "../adapter/out/repository/work/prisma-agent-work.repository";
import { PrismaAgentWorkTransaction } from "../adapter/out/transaction/work/prisma-agent-work.transaction";

let prisma: PrismaClient;
let repository: PrismaAgentWorkRepository;
let transaction: PrismaAgentWorkTransaction;
const organizationId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const userId = "f1234567-89ab-4cde-8f01-23456789abcd";
const attemptSnapshot = { input: {}, applicationVersion: "1.0.0", authorizingGitSha: "a".repeat(40), cliVersion: "1.0.0" };

beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  repository = new PrismaAgentWorkRepository(prisma);
  transaction = new PrismaAgentWorkTransaction(prisma);
  await prisma.$connect();
});
afterAll(async () => prisma.$disconnect());
beforeEach(async () => {
  await prisma.agentCapabilityApproval.deleteMany({
    where: { organizationId },
  });
  await prisma.agentCapabilityInvocation.deleteMany({
    where: { organizationId },
  });
  await prisma.agentAttempt.deleteMany({ where: { organizationId } });
  await prisma.agentTask.deleteMany({ where: { organizationId } });
  await prisma.agentSession.deleteMany({ where: { organizationId } });
  await prisma.agentVersion.deleteMany({
    where: {
      agentDefinitionKey: {
        in: ["operator_work_test", "operator_work_test_other"],
      },
    },
  });
  await prisma.organizationMembership.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.organization.create({
    data: { id: organizationId, name: "Test", slug: "agent-work-test" },
  });
  await prisma.user.create({
    data: { id: userId, email: "agent-work@test.local", name: "Tester" },
  });
  await prisma.organizationMembership.create({
    data: { organizationId, userId, status: "active" },
  });
});

describe("PrismaAgentWorkRepository", () => {
  it("admits an organization-fenced session and exactly one root task", async () => {
    const version = await prisma.agentVersion.create({
      data: {
        agentDefinitionKey: "operator_work_test",
        version: 1,
        assignedDomains: ["agent_os"],
        capabilityKeys: [],
        runtimeType: "codex_cli",
        instructionProfileRef: "operator/v1",
        manifestHash: "a".repeat(64),
        activatedAt: new Date(),
      },
    });
    const admitted = await transaction.admitRootAttempt({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: version.id,
      objective: "Check inventory",
      completionCriteria: "Summarize availability",
      inputResourceRefs: [],
      ...attemptSnapshot,
    });
    expect(admitted.task.sessionId).toBe(admitted.session.id);
    expect(await repository.loadProjection(admitted.session)).toMatchObject({
      tasks: [{ id: admitted.task.id }],
    });
    await expect(
      transaction.admitRootAttempt({
        organizationId,
        createdByUserId: userId,
        assignedAgentVersionId: version.id,
        objective: "Again",
        completionCriteria: "Nope",
        inputResourceRefs: [],
        sessionId: admitted.session.id,
        ...attemptSnapshot,
      }),
    ).rejects.toThrow();
    expect(
      await repository.loadProjection({
        id: admitted.session.id,
        organizationId: "00000000-0000-4000-8000-000000000000",
      }),
    ).toBeNull();
  });

  it("rejects cross-session delegated attempts and invocations", async () => {
    const version = await prisma.agentVersion.create({
      data: {
        agentDefinitionKey: "operator_work_test",
        version: 1,
        assignedDomains: ["agent_os"],
        capabilityKeys: [],
        runtimeType: "codex_cli",
        instructionProfileRef: "operator/v1",
        manifestHash: "b".repeat(64),
        activatedAt: new Date(),
      },
    });
    const first = await transaction.admitRootAttempt({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: version.id,
      objective: "First",
      completionCriteria: "First",
      inputResourceRefs: [],
      ...attemptSnapshot,
    });
    const second = await transaction.admitRootAttempt({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: version.id,
      objective: "Second",
      completionCriteria: "Second",
      inputResourceRefs: [],
      ...attemptSnapshot,
    });
    const attempt = { id: first.attempt.id };
    const wrongVersion = await prisma.agentVersion.create({
      data: {
        agentDefinitionKey: "operator_work_test_other",
        version: 1,
        assignedDomains: ["agent_os"],
        capabilityKeys: [],
        runtimeType: "codex_cli",
        instructionProfileRef: "operator/v1",
        manifestHash: "e".repeat(64),
        activatedAt: new Date(),
      },
    });
    await expect(
      prisma.agentAttempt.create({
        data: {
          organizationId,
          sessionId: first.session.id,
          taskId: first.task.id,
          agentVersionId: wrongVersion.id,
          ordinal: 2,
          input: {},
          runtimeType: "codex_cli",
          instructionProfileRef: "operator/v1",
          applicationVersion: "1.0.0",
          authorizingGitSha: "a".repeat(40),
          cliVersion: "1.0.0",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.agentTask.create({
        data: {
          organizationId,
          sessionId: second.session.id,
          parentTaskId: second.task.id,
          assignedAgentVersionId: version.id,
          objective: "Bad delegate",
          completionCriteria: "Never",
          inputResourceRefs: [],
          delegatedFromAttemptId: attempt.id,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.agentCapabilityInvocation.create({
        data: {
          organizationId,
          sessionId: second.session.id,
          taskId: second.task.id,
          attemptId: attempt.id,
          agentVersionId: version.id,
          initiatingUserId: userId,
          capabilityKey: "products.inspect",
          ownerDomain: "products",
          authorizationKind: "agent_default_scope",
          authorizationExpiresAt: new Date(Date.now() + 60_000),
          inputHash: "c".repeat(64),
          effects: ["read"],
          approvalRisk: "none",
          idempotencyRequirement: "none",
          applicationVersion: "1.0.0",
          authorizingGitSha: "a".repeat(40),
          capabilityContractFingerprint: "d".repeat(64),
          runtimeType: "codex_cli",
        },
      }),
    ).rejects.toThrow();
  });
});
