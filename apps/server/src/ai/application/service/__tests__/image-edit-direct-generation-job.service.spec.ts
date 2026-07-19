import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageEditDirectGenerationJobService } from '../image-edit-direct-generation-job.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const OPERATION_KEY = `image-edit:${TASK_ID}`;

function job(status = 'running', result: unknown = null) {
  return {
    id: TASK_ID,
    organizationId: ORG,
    jobType: 'image_edit',
    sourceResourceId: TASK_ID,
    status,
    payload: {
      jobType: 'image_edit',
      models: { image: 'gemini-image-model' },
      input: { image_url: 'https://storage.example.com/input.png', preset: 'custom' },
    },
    result,
    attempts: 1,
    maxAttempts: 3,
    scheduledFor: new Date(),
    claimedAt: new Date(),
    claimedBy: 'worker-1',
    leaseExpiresAt: new Date(),
    finishedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeService() {
  const repository = {
    create: vi.fn().mockResolvedValue(job('held')),
    release: vi.fn().mockResolvedValue(true),
    findById: vi.fn().mockResolvedValue(job()),
    cancel: vi.fn().mockResolvedValue(job('cancelled')),
    failOrReschedule: vi.fn().mockResolvedValue(undefined),
  };
  const inputAssets = {
    persistImageEditInputs: vi.fn(async ({ payload }) => payload),
  };
  const worker = { wake: vi.fn() };
  const operationAlerts = {
    start: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({ status: 'cancelled' }),
  };
  return {
    repository,
    inputAssets,
    worker,
    operationAlerts,
    service: new ImageEditDirectGenerationJobService(
      repository as never,
      inputAssets as never,
      worker as never,
      {
        workerIntervalMs: 1_000,
        leaseMs: 60_000,
        providerTimeoutMs: 120_000,
        heldRecoveryMs: 30_000,
        retryDelaysMs: [5_000, 30_000, 120_000],
      },
      operationAlerts as never,
    ),
  };
}

describe('ImageEditDirectGenerationJobService', () => {
  beforeEach(() => {
    process.env.AI_IMAGE_MODEL = 'gemini-image-model';
  });

  it('creates, alerts, releases, and wakes a durable image-edit job', async () => {
    const { service, repository, operationAlerts, worker } = makeService();

    const result = await service.schedule({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      payload: {
        image_url: 'https://storage.example.com/input.png',
        preset: 'custom',
      },
    });

    expect(result.taskId).toMatch(/[0-9a-f-]{36}/);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        jobType: 'image_edit',
        status: 'held',
      }),
    );
    expect(operationAlerts.start).toHaveBeenCalled();
    expect(repository.release).toHaveBeenCalled();
    expect(worker.wake).toHaveBeenCalled();
  });

  it('marks a running durable task and its alert cancelled', async () => {
    const { service, repository, operationAlerts } = makeService();

    await expect(
      service.cancel({
        organizationId: ORG,
        taskId: TASK_ID,
        actorUserId: 'user-1',
        reason: '사용자 요청',
      }),
    ).resolves.toEqual({
      status: 'cancelled',
      jobId: TASK_ID,
      operationKey: OPERATION_KEY,
      preserved: false,
    });

    expect(repository.cancel).toHaveBeenCalledWith({
      organizationId: ORG,
      jobId: TASK_ID,
      reason: '사용자 요청',
    });
    expect(operationAlerts.cancel).toHaveBeenCalledWith(
      ORG,
      OPERATION_KEY,
      expect.objectContaining({ message: '사용자 요청' }),
    );
  });

  it('maps a checkpointed projecting job to a readable succeeded result', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValueOnce(
      job('projecting', { image_url: 'https://storage.example.com/output.png' }),
    );

    await expect(service.getStatus(ORG, TASK_ID)).resolves.toMatchObject({
      taskId: TASK_ID,
      status: 'succeeded',
      output: { image_url: 'https://storage.example.com/output.png' },
    });
  });

  it('preserves a success when cancellation loses the terminal race', async () => {
    const { service, repository, operationAlerts } = makeService();
    repository.findById.mockResolvedValueOnce(
      job('succeeded', { image_url: 'https://storage.example.com/output.png' }),
    );

    await expect(
      service.cancel({
        organizationId: ORG,
        taskId: TASK_ID,
        actorUserId: 'user-1',
        reason: '사용자 요청',
      }),
    ).resolves.toMatchObject({
      status: 'already_terminal',
      preserved: true,
    });
    expect(repository.cancel).not.toHaveBeenCalled();
    expect(operationAlerts.cancel).not.toHaveBeenCalled();
  });
});
