import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentWorkController } from '../adapter/in/http/interaction/agent-work.controller';
import { AttemptTokenRegistry } from '../adapter/out/runtime/runner/attempt-token.registry';
import { RunnerCommandQueue } from '../adapter/out/runtime/runner/runner-command.queue';
import { RunnerEventHandlerService } from '../adapter/out/runtime/runner/runner-event-handler.service';
import { PrismaAgentWorkTransaction } from '../adapter/out/transaction/work/prisma-agent-work.transaction';
import { AgentAttemptCapacityService } from '../application/service/work/agent-attempt-capacity.service';
import { AgentAttemptAdmissionService } from '../application/service/work/agent-attempt-admission.service';
import { makeTestPrisma, resetDb } from '../../test-helpers/real-prisma';
import type {
  DelegateTaskInput,
  InvocationAuthorizationInput,
} from '../application/port/out/work/agent-work-persistence.types';
import type { PrismaClient } from '@prisma/client';

const organizationId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const userId = 'f1234567-89ab-4cde-8f01-23456789abcd';
const gitSha = 'a'.repeat(40);
const ADVISORY_NAMESPACE = 571882;
const ADMISSION_BARRIER_KEY = 101;
const TERMINAL_BARRIER_KEY = 102;

let prisma: PrismaClient;
let work: PrismaAgentWorkTransaction;

const snapshot = {
  applicationVersion: '1.0.0',
  authorizingGitSha: gitSha,
  cliVersion: '1.0.0',
};

const readyPreflight = {
  assertRoot: async () => undefined,
  assertFollowUp: async () => undefined,
  assertDelegation: async () => undefined,
};

beforeAll(async () => {
  prisma = makeTestPrisma();
  work = new PrismaAgentWorkTransaction(prisma);
  await prisma.$connect();
});

afterAll(async () => {
  await removeAttemptLifecycleBarrier();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await removeAttemptLifecycleBarrier();
  await resetDb(prisma);
  await prisma.organization.create({
    data: { id: organizationId, name: 'Lifecycle races', slug: 'agent-work-lifecycle-races' },
  });
  await prisma.user.create({
    data: { id: userId, email: 'agent-work-lifecycle-races@test.local', name: 'Lifecycle Racer' },
  });
  await prisma.organizationMembership.create({
    data: { organizationId, userId, status: 'active' },
  });
});

async function liveRoot() {
  const version = await prisma.agentVersion.create({
    data: {
      agentDefinitionKey: 'agent_work_lifecycle_race',
      version: 1,
      assignedDomains: ['agent_os'],
      capabilityKeys: [],
      runtimeType: 'codex_cli',
      instructionProfileRef: 'test/v1',
      manifestHash: 'b'.repeat(64),
      activatedAt: new Date(),
    },
  });
  const admitted = await work.admitRootAttempt({
    organizationId,
    createdByUserId: userId,
    assignedAgentVersionId: version.id,
    objective: 'Lifecycle race',
    completionCriteria: 'Keep terminal cleanup exact.',
    inputResourceRefs: [],
    input: {},
    ...snapshot,
  });
  return { ...admitted, version };
}

async function terminalRoot() {
  const root = await liveRoot();
  await prisma.agentAttempt.update({
    where: { id: root.attempt.id },
    data: { status: 'succeeded', finishedAt: new Date() },
  });
  return root;
}

async function inlineRead(root: Awaited<ReturnType<typeof liveRoot>>) {
  return prisma.agentCapabilityInvocation.create({
    data: {
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      attemptId: root.attempt.id,
      agentVersionId: root.version.id,
      initiatingUserId: userId,
      capabilityKey: 'agent_os.read',
      ownerDomain: 'agent_os',
      authorizationKind: 'agent_default_scope',
      authorizationExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      inputHash: 'c'.repeat(64),
      effects: ['read'],
      approvalRisk: 'none',
      idempotencyRequirement: 'none',
      applicationVersion: snapshot.applicationVersion,
      authorizingGitSha: gitSha,
      capabilityContractFingerprint: 'd'.repeat(64),
      runtimeType: 'codex_cli',
      status: 'authorized',
    },
  });
}

describe('Agent Work lifecycle races', () => {
  it('interrupts the exactly cancelled Attempt admitted behind the pre-cancel read and releases its capacity once', async () => {
    const root = await terminalRoot();
    const capacity = new AgentAttemptCapacityService(1);
    const admissions = new AgentAttemptAdmissionService(capacity, work, readyPreflight);
    const releaseAttempt = vi.spyOn(capacity, 'releaseAttempt');
    const tokens = new AttemptTokenRegistry();
    const revokeAttempt = vi.spyOn(tokens, 'revokeAttempt');
    const handler = new RunnerEventHandlerService({
      leases: { setLossHandlers: vi.fn(), acceptEventBatch: vi.fn() } as never,
      commands: new RunnerCommandQueue(),
      tokens,
      work,
      capacity,
      output: { publish: vi.fn(), finish: vi.fn() },
    });
    const queries = { liveAttempt: vi.fn().mockResolvedValue(null) };
    const interrupt = vi.fn((attemptId: string) => handler.interruptAttempt(attemptId));
    const Controller = AgentWorkController as unknown as new (...args: unknown[]) => AgentWorkController;
    const controller = new Controller(
      queries,
      { transition: work.transitionTask.bind(work) },
      { interrupt },
      {},
    );
    await installAttemptLifecycleBarrier();
    const barrier = holdAdvisoryLock(ADMISSION_BARRIER_KEY);

    try {
      await barrier.entered;
      const admission = admissions.followUp({
        organizationId,
        sessionId: root.session.id,
        taskId: root.task.id,
        requestedByUserId: userId,
        predecessorAttemptId: root.attempt.id,
        input: { __agent_work_test_barrier: 'admission' },
        ...snapshot,
      });
      await waitForAdvisoryWaiter(ADMISSION_BARRIER_KEY);
      const cancellation = controller.cancel(
        root.session.id,
        root.task.id,
        organizationId,
        { id: userId } as never,
      );

      barrier.release();
      const [admitted, cancelled] = await Promise.all([admission, cancellation]);
      await barrier.completed;

      expect(cancelled).toEqual({ status: 'cancelled' });
      expect(queries.liveAttempt).not.toHaveBeenCalled();
      expect(interrupt).toHaveBeenCalledTimes(1);
      expect(interrupt).toHaveBeenCalledWith(admitted.attemptId);
      expect(revokeAttempt).toHaveBeenCalledTimes(1);
      expect(revokeAttempt).toHaveBeenCalledWith(admitted.attemptId);
      expect(releaseAttempt).toHaveBeenCalledTimes(1);
      expect(releaseAttempt).toHaveBeenCalledWith(admitted.attemptId);
      await expect(prisma.agentAttempt.findUnique({
        where: { id: admitted.attemptId },
        select: { status: true },
      })).resolves.toEqual({ status: 'cancelled' });
      const reusable = capacity.tryReserve();
      reusable.release();
    } finally {
      barrier.release();
      await barrier.completed;
      await removeAttemptLifecycleBarrier();
    }
  });

  it('makes terminal Attempt transition win over a concurrent inline-read finalizer', async () => {
    const root = await liveRoot();
    const read = await inlineRead(root);
    await prisma.agentAttempt.update({
      where: { id: root.attempt.id },
      data: { input: { __agent_work_test_barrier: 'terminal' } },
    });
    await installAttemptLifecycleBarrier();
    const barrier = holdAdvisoryLock(TERMINAL_BARRIER_KEY);

    try {
      await barrier.entered;
      const terminal = work.transitionAttempt({
        attemptId: root.attempt.id,
        from: 'starting',
        to: 'failed',
        at: new Date('2030-01-01T00:00:00.000Z'),
        error: { code: 'attempt_terminal', message: 'Attempt terminalized.' },
      });
      await waitForAdvisoryWaiter(TERMINAL_BARRIER_KEY);
      const finalized = work.finalizeInlineInvocation({
        organizationId,
        invocationId: read.id,
        outcome: 'succeeded',
        result: { outcome: 'completed', summary: 'late inline result', resourceRefs: [], operationRefs: [] },
        finishedAt: new Date('2030-01-01T00:00:01.000Z'),
      });

      barrier.release();
      await expect(terminal).resolves.toEqual({ transitioned: true });
      await expect(finalized).resolves.toEqual({ won: false });
      await barrier.completed;
      await expect(prisma.agentCapabilityInvocation.findUnique({
        where: { id: read.id },
        select: { status: true, error: true },
      })).resolves.toEqual({
        status: 'failed',
        error: {
          code: 'attempt_terminalized',
          message: 'Inline read was interrupted because its Attempt terminalized.',
        },
      });
    } finally {
      barrier.release();
      await barrier.completed;
      await removeAttemptLifecycleBarrier();
    }
  });

  it('replays a delegated explicit mutation authorization after its child Attempt is terminal', async () => {
    const root = await liveRoot();
    const target = await prisma.agentVersion.create({
      data: {
        agentDefinitionKey: 'agent_work_lifecycle_target',
        version: 1,
        assignedDomains: ['products'],
        capabilityKeys: [],
        runtimeType: 'codex_cli',
        instructionProfileRef: 'test/products-v1',
        manifestHash: 'e'.repeat(64),
        activatedAt: new Date(),
      },
    });
    const explicitInput = { sku: 'sku-1' };
    const delegation: DelegateTaskInput = {
      organizationId,
      sessionId: root.session.id,
      parentTaskId: root.task.id,
      delegatingAttemptId: root.attempt.id,
      requestedByUserId: userId,
      targetAgentVersionId: target.id,
      objective: 'Create one product mutation.',
      completionCriteria: 'Product mutation is admitted.',
      inputResourceRefs: [],
      idempotencyKey: 'delegation-explicit-replay',
      requestHash: 'f'.repeat(64),
      input: {
        explicitExecutionGrant: {
          capabilityKey: 'products.write',
          ownerDomain: 'products',
          input: explicitInput,
          parentTaskId: root.task.id,
          rootTaskId: root.task.id,
          delegatingAttemptId: root.attempt.id,
        },
      },
      ...snapshot,
    };
    const child = await work.delegateTask(delegation);
    const authorization: InvocationAuthorizationInput = {
      organizationId,
      sessionId: root.session.id,
      taskId: child.childTaskId,
      attemptId: child.firstAttemptId,
      agentVersionId: target.id,
      initiatingUserId: userId,
      capabilityKey: 'products.write',
      ownerDomain: 'products',
      authorizationKind: 'explicit_execution_grant',
      authorizationExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      inputHash: 'a'.repeat(64),
      canonicalInput: explicitInput,
      effects: ['db_write'],
      approvalRisk: 'low',
      idempotencyRequirement: 'required',
      ownerIdempotencyKey: 'products-write-owner-key',
      capabilityContractFingerprint: 'b'.repeat(64),
      initialStatus: 'ready',
    };
    const first = await work.authorizeInvocation(authorization);
    await prisma.agentAttempt.update({
      where: { id: child.firstAttemptId },
      data: { status: 'succeeded', finishedAt: new Date() },
    });

    await expect(work.delegateTask(delegation)).resolves.toEqual({
      childTaskId: child.childTaskId,
      firstAttemptId: child.firstAttemptId,
      attemptId: child.firstAttemptId,
      replayed: true,
      launchRequired: false,
      taskTerminal: false,
    });
    await expect(prisma.agentAttempt.count({ where: { taskId: child.childTaskId } })).resolves.toBe(1);
    await expect(work.authorizeInvocation(authorization)).resolves.toEqual(first);
    await expect(work.authorizeInvocation({
      ...authorization,
      inputHash: 'c'.repeat(64),
      canonicalInput: { sku: 'sku-2' },
    })).rejects.toMatchObject({ code: 'owner_idempotency_input_conflict' });
    await expect(work.authorizeInvocation({
      ...authorization,
      inputHash: 'd'.repeat(64),
      canonicalInput: { sku: 'sku-3' },
      ownerIdempotencyKey: 'products-write-new-owner-key',
    })).rejects.toMatchObject({ code: 'attempt_not_live' });
  });

  it('keeps the Task open when the 51st referenced Operation is still active', async () => {
    const root = await terminalRoot();
    const completedOperationIds = Array.from({ length: 50 }, (_, index) => `operation-${index + 1}`);
    const activeOperationId = 'operation-51';
    await prisma.agentAttempt.update({
      where: { id: root.attempt.id },
      data: {
        result: completedResult(completedOperationIds.map((id) => ({ kind: 'operation_run', id }))),
      },
    });
    await succeededOperationInvocation(root, activeOperationId);
    let active = true;
    const operations = {
      get: vi.fn(async (_organizationId: string, operationId: string) => ({
        id: operationId,
        status: active && operationId === activeOperationId ? 'running' : 'succeeded',
      }) as never),
    };
    const finalizer = new PrismaAgentWorkTransaction(prisma, operations);

    await expect(finalizer.finalizeTaskFromAttempt({
      attemptId: root.attempt.id,
      at: new Date('2030-01-01T00:00:00.000Z'),
    })).resolves.toEqual({ finalized: false, status: null });
    expect(operations.get).toHaveBeenCalledWith(organizationId, activeOperationId);
    await expect(prisma.agentTask.findUnique({
      where: { id: root.task.id },
      select: { status: true },
    })).resolves.toEqual({ status: 'open' });

    active = false;
    await expect(finalizer.finalizeTaskFromAttempt({
      attemptId: root.attempt.id,
      at: new Date('2030-01-01T00:00:01.000Z'),
    })).resolves.toEqual({ finalized: true, status: 'completed' });
  });

  it('leaves finalization as a no-op when explicit Continue admission already won', async () => {
    const root = await terminalRoot();
    await prisma.agentAttempt.update({
      where: { id: root.attempt.id },
      data: { result: completedResult([]) },
    });
    const capacity = new AgentAttemptCapacityService(1);
    const admissions = new AgentAttemptAdmissionService(capacity, work, readyPreflight);
    const continued = await admissions.followUp({
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      requestedByUserId: userId,
      predecessorAttemptId: root.attempt.id,
      input: { continuation: 'retry after terminal result' },
      ...snapshot,
    });

    await expect(work.finalizeTaskFromAttempt({
      attemptId: root.attempt.id,
      at: new Date('2030-01-01T00:00:00.000Z'),
    })).resolves.toEqual({ finalized: false, status: null });
    await expect(prisma.agentTask.findUnique({
      where: { id: root.task.id },
      select: { status: true },
    })).resolves.toEqual({ status: 'open' });
    capacity.releaseAttempt(continued.attemptId);
  });

  it('holds the Task lock through finalization so a concurrent Continue is rejected', async () => {
    const root = await terminalRoot();
    const operationId = 'operation-finalization-fence';
    await prisma.agentAttempt.update({
      where: { id: root.attempt.id },
      data: { result: completedResult([{ kind: 'operation_run', id: operationId }]) },
    });
    const gate = operationGate();
    const finalizer = new PrismaAgentWorkTransaction(prisma, { get: gate.get });
    const capacity = new AgentAttemptCapacityService(1);
    const admissions = new AgentAttemptAdmissionService(capacity, work, readyPreflight);
    const finalization = finalizer.finalizeTaskFromAttempt({
      attemptId: root.attempt.id,
      at: new Date('2030-01-01T00:00:00.000Z'),
    });
    await gate.entered;
    const admission = admissions.followUp({
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      requestedByUserId: userId,
      predecessorAttemptId: root.attempt.id,
      input: { continuation: 'must not race finalization' },
      ...snapshot,
    });

    expect(await settlesWithin(admission, 100)).toBe(false);
    gate.release();
    await expect(finalization).resolves.toEqual({ finalized: true, status: 'completed' });
    await expect(admission).rejects.toMatchObject({ code: 'task_not_open' });
    await expect(prisma.agentAttempt.count({ where: { taskId: root.task.id } })).resolves.toBe(1);
  });
});

function completedResult(operationRefs: Array<{ kind: string; id: string }>) {
  return {
    outcome: 'completed',
    summary: 'Terminal work completed.',
    resourceRefs: [],
    operationRefs,
  };
}

async function succeededOperationInvocation(
  root: Awaited<ReturnType<typeof liveRoot>>,
  operationId: string,
) {
  return prisma.agentCapabilityInvocation.create({
    data: {
      organizationId,
      sessionId: root.session.id,
      taskId: root.task.id,
      attemptId: root.attempt.id,
      agentVersionId: root.version.id,
      initiatingUserId: userId,
      capabilityKey: 'agent_os.operation_settlement',
      ownerDomain: 'agent_os',
      authorizationKind: 'agent_default_scope',
      authorizationExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
      inputHash: 'd'.repeat(64),
      canonicalInput: { operationId },
      effects: ['db_write'],
      approvalRisk: 'low',
      idempotencyRequirement: 'required',
      ownerIdempotencyKey: `operation-settlement-${operationId}`,
      applicationVersion: snapshot.applicationVersion,
      authorizingGitSha: gitSha,
      capabilityContractFingerprint: 'e'.repeat(64),
      runtimeType: root.version.runtimeType,
      status: 'succeeded',
      result: completedResult([{ kind: 'operation_run', id: operationId }]),
      finishedAt: new Date('2030-01-01T00:00:00.000Z'),
    },
  });
}

function operationGate(): {
  entered: Promise<void>;
  release(): void;
  get: (organizationId: string, operationId: string) => Promise<never>;
} {
  let enter!: () => void;
  let unblock!: () => void;
  let entered = false;
  const enteredPromise = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  return {
    entered: enteredPromise,
    release: () => unblock(),
    get: async (_organizationId: string, operationId: string) => {
      if (!entered) {
        entered = true;
        enter();
      }
      await blocked;
      return { id: operationId, status: 'succeeded' } as never;
    },
  };
}

async function settlesWithin(value: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  const settled = value.then(() => true, () => true);
  return Promise.race([
    settled,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function installAttemptLifecycleBarrier(): Promise<void> {
  await removeAttemptLifecycleBarrier();
  await prisma.$executeRaw`
    CREATE FUNCTION agent_work_test_lifecycle_barrier()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.input ->> '__agent_work_test_barrier' = 'admission' THEN
        PERFORM pg_advisory_xact_lock(571882, 101);
      ELSIF TG_OP = 'UPDATE' AND NEW.input ->> '__agent_work_test_barrier' = 'terminal' THEN
        PERFORM pg_advisory_xact_lock(571882, 102);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
  await prisma.$executeRaw`
    CREATE TRIGGER agent_work_test_lifecycle_barrier_trigger
    BEFORE INSERT OR UPDATE ON agent_attempts
    FOR EACH ROW EXECUTE FUNCTION agent_work_test_lifecycle_barrier()
  `;
}

async function removeAttemptLifecycleBarrier(): Promise<void> {
  await prisma.$executeRaw`
    DROP TRIGGER IF EXISTS agent_work_test_lifecycle_barrier_trigger ON agent_attempts
  `;
  await prisma.$executeRaw`
    DROP FUNCTION IF EXISTS agent_work_test_lifecycle_barrier()
  `;
}

function holdAdvisoryLock(key: number): {
  entered: Promise<void>;
  completed: Promise<void>;
  release(): void;
} {
  let signalEntered!: () => void;
  let signalRelease!: () => void;
  let released = false;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const releaseGate = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  const completed = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_NAMESPACE}, ${key})`;
    signalEntered();
    await releaseGate;
  });
  return {
    entered,
    completed,
    release: () => {
      if (released) return;
      released = true;
      signalRelease();
    },
  };
}

async function waitForAdvisoryWaiter(key: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND classid = ${ADVISORY_NAMESPACE}
        AND objid = ${key}
        AND NOT granted
    `;
    if (Number(rows[0]?.count ?? 0) > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for advisory barrier ${key}.`);
}
