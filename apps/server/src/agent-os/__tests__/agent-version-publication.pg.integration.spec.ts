import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, resetDb } from '../../test-helpers/real-prisma';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from '../domain/catalog/agent-version-publication.registry';
import { FINAL_CAPABILITY_DEFINITIONS } from '../domain/catalog/final-capability.catalog';
import { AgentVersionPublisher } from '../application/service/work/agent-work-version-publisher.service';
import { PrismaAgentWorkTransaction } from '../adapter/out/transaction/work/prisma-agent-work.transaction';
import { PrismaAgentWorkRepository } from '../adapter/out/repository/work/prisma-agent-work.repository';
import { AgentCapabilityInvocationService } from '../application/service/work/agent-capability-invocation.service';
import type { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;
let versions: AgentVersionPublisher;
let work: PrismaAgentWorkTransaction;
let repository: PrismaAgentWorkRepository;

const organizationId = 'c1d2e3f4-a5b6-47c8-9d0e-1f2a3b4c5d6e';
const userId = 'd1234567-89ab-4cde-8f01-23456789abcd';
const attemptSnapshot = {
  applicationVersion: '1.0.0',
  authorizingGitSha: 'a'.repeat(40),
  cliVersion: '1.0.0',
};

beforeAll(async () => {
  prisma = makeTestPrisma();
  versions = new AgentVersionPublisher(prisma);
  work = new PrismaAgentWorkTransaction(prisma);
  repository = new PrismaAgentWorkRepository(prisma);
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await prisma.agentVersion.deleteMany();
});

describe('KID-25 AgentVersion publication', () => {
  it('derives default capability keys from the final catalog for every assigned owner domain', () => {
    expect(AGENT_VERSION_PUBLICATION_DEFINITIONS).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentDefinitionKey: 'operator', capabilityKeys: ['agent_os.platform_probe'] }),
      expect.objectContaining({ agentDefinitionKey: 'sourcing', capabilityKeys: [
        'sourcing.collect_shadow_signals', 'sourcing.createReviewBatch',
        'sourcing.duplicateCheck', 'sourcing.ingestCandidate',
        'sourcing.inspectRecommendationRun', 'sourcing.refreshCollection',
        'sourcing.refreshValidation', 'sourcing.retrieveWorkspaceEvidence',
        'sourcing.scrapeProductUrl', 'sourcing.scrapeUrlWorkflow',
      ] }),
      expect.objectContaining({ agentDefinitionKey: 'merchandising', capabilityKeys: ['products.create_listing_generation_package'] }),
      expect.objectContaining({ agentDefinitionKey: 'supply', capabilityKeys: ['supply.create_purchase_order_draft', 'supply.submit_purchase_order'] }),
      expect.objectContaining({ agentDefinitionKey: 'channel_operations', capabilityKeys: [
        'channels.register_confirmed_listing', 'channels.submit_coupang_listing', 'channels.submit_wing_thumbnail',
      ] }),
      expect.objectContaining({ agentDefinitionKey: 'advertising', capabilityKeys: [] }),
    ]));
  });

  it('publishes six immutable code-owned snapshots and creates immutable A-to-B-to-A successors', async () => {
    expect(AGENT_VERSION_PUBLICATION_DEFINITIONS).toHaveLength(6);
    const published = await Promise.all(
      AGENT_VERSION_PUBLICATION_DEFINITIONS.map((definition) => versions.publish(definition)),
    );
    expect(new Set(published.map((version) => version.agentDefinitionKey)).size).toBe(6);
    expect(published.every((version) => version.activatedAt && !version.retiredAt)).toBe(true);

    const original = AGENT_VERSION_PUBLICATION_DEFINITIONS.find((definition) => definition.agentDefinitionKey === 'sourcing')!;
    const successor = await versions.publish({
      ...original,
      capabilityKeys: [...original.capabilityKeys, 'analytics.readOverview'],
      manifestHash: 'f'.repeat(64),
    });
    const returned = await versions.publish(original);
    const originalRow = await prisma!.agentVersion.findFirstOrThrow({
      where: { agentDefinitionKey: original.agentDefinitionKey, manifestHash: original.manifestHash },
    });
    expect(successor.version).toBe(originalRow.version + 1);
    expect(originalRow.capabilityKeys).toEqual([...original.capabilityKeys]);
    expect(originalRow.retiredAt).toBeInstanceOf(Date);
    expect(returned.version).toBe(successor.version + 1);
    expect(returned.id).not.toBe(originalRow.id);
    const successorRow = await prisma!.agentVersion.findUniqueOrThrow({ where: { id: successor.id } });
    expect(successorRow.retiredAt).toBeInstanceOf(Date);
    expect(returned.retiredAt).toBeNull();
  });

  it('keeps an existing Task pinned to activated version A after publication retires it, while new roots select B', async () => {
    const operator = AGENT_VERSION_PUBLICATION_DEFINITIONS.find(
      (definition) => definition.agentDefinitionKey === 'operator',
    )!;
    const versionA = await versions.publish(operator);
    await prisma!.organization.create({
      data: { id: organizationId, name: 'Pinned version', slug: 'pinned-version' },
    });
    await prisma!.user.create({
      data: { id: userId, email: 'pinned-version@test.local', name: 'Pinned version user' },
    });
    await prisma!.organizationMembership.create({
      data: { organizationId, userId, status: 'active' },
    });

    const root = await work.admitRootAttempt({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: versionA.id,
      objective: 'Keep the immutable snapshot.',
      completionCriteria: 'Continue from the same AgentVersion.',
      inputResourceRefs: [],
      input: { prompt: 'Start with version A.' },
      ...attemptSnapshot,
    });
    await prisma!.agentAttempt.update({
      where: { id: root.attempt.id },
      data: { status: 'succeeded', finishedAt: new Date() },
    });

    const versionB = await versions.publish({
      ...operator,
      instructionProfileRef: `${operator.instructionProfileRef}.next`,
      manifestHash: 'f'.repeat(64),
    });
    await expect(
      prisma!.agentVersion.findUniqueOrThrow({ where: { id: versionA.id } }),
    ).resolves.toMatchObject({ retiredAt: expect.any(Date) });
    await expect(repository.taskVersion({
      organizationId,
      userId,
      sessionId: root.session.id,
      taskId: root.task.id,
    })).resolves.toMatchObject({ id: versionA.id });
    await expect(work.admitRootAttempt({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: versionA.id,
      objective: 'Do not select retired version A for a new root.',
      completionCriteria: 'Select the current snapshot instead.',
      inputResourceRefs: [],
      input: { prompt: 'This must be rejected.' },
      ...attemptSnapshot,
    })).rejects.toMatchObject({ code: 'agent_version_not_active' });

    const successor = await work.admitAttempt({
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      requestedByUserId: userId,
      predecessorAttemptId: root.attempt.id,
      input: { prompt: 'Continue from version A.' },
      ...attemptSnapshot,
    });
    expect(successor.ordinal).toBe(2);

    const platformProbe = FINAL_CAPABILITY_DEFINITIONS.find(
      (definition) => definition.key === 'agent_os.platform_probe',
    )!;
    const capabilities = {
      resolveDefinition: (key: string) =>
        key === platformProbe.key ? platformProbe : null,
    };
    const authorization = await new AgentCapabilityInvocationService(
      work,
      capabilities as never,
    ).authorize({
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      attemptId: successor.attemptId,
      agentVersionId: versionA.id,
      initiatingUserId: userId,
      capabilityKey: platformProbe.key,
      authorizationKind: 'agent_default_scope',
      authorizationExpiresAt: new Date(Date.now() + 60_000),
      input: {},
    });
    expect(authorization).toMatchObject({ invocationStatus: 'authorized' });

    await expect(repository.activeVersion('operator')).resolves.toMatchObject({ id: versionB.id });
    const freshRoot = await work.admitRootAttempt({
      organizationId,
      createdByUserId: userId,
      assignedAgentVersionId: versionB.id,
      objective: 'Start with the current version.',
      completionCriteria: 'Use version B.',
      inputResourceRefs: [],
      input: { prompt: 'Start with version B.' },
      ...attemptSnapshot,
    });
    await expect(
      prisma!.agentTask.findUniqueOrThrow({ where: { id: freshRoot.task.id } }),
    ).resolves.toMatchObject({ assignedAgentVersionId: versionB.id });
  });
});
