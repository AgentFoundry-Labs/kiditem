import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageEditDirectGenerationJobService } from '../image-edit-direct-generation-job.service';

const ORG = 'organization-1';
const TASK_ID = 'image-job-1';
const OPERATION_KEY = `image-edit:${TASK_ID}`;

function makeAlert(status = 'running') {
  return {
    id: 'alert-1',
    organizationId: ORG,
    operationKey: OPERATION_KEY,
    status,
    progress: 0.2,
    metadata: {},
  };
}

function makeService() {
  const executor = {
    execute: vi.fn().mockResolvedValue({
      image_url: 'https://cdn.example.com/edited.png',
    }),
  };
  const operationAlerts = {
    start: vi.fn(),
    findByOperationKey: vi.fn().mockResolvedValue(makeAlert()),
    succeed: vi.fn().mockResolvedValue(makeAlert('succeeded')),
    fail: vi.fn().mockResolvedValue(makeAlert('failed')),
    cancel: vi.fn().mockResolvedValue(makeAlert('cancelled')),
  };

  return {
    executor,
    operationAlerts,
    service: new ImageEditDirectGenerationJobService(
      executor as never,
      operationAlerts as never,
    ),
  };
}

function runProcess(
  service: ImageEditDirectGenerationJobService,
  input: {
    organizationId: string;
    taskId: string;
    operationKey: string;
    payload: { image_url: string; preset: string };
  },
) {
  return (
    service as unknown as {
      process(command: typeof input): Promise<void>;
    }
  ).process(input);
}

describe('ImageEditDirectGenerationJobService cancellation', () => {
  beforeEach(() => {
    process.env.AI_IMAGE_MODEL = 'gemini-image-model';
  });

  it('marks a running direct image edit task cancelled', async () => {
    const { service, operationAlerts } = makeService();

    const result = await service.cancel({
      organizationId: ORG,
      taskId: TASK_ID,
      actorUserId: 'user-1',
      reason: '사용자 요청',
    });

    expect(operationAlerts.cancel).toHaveBeenCalledWith(
      ORG,
      OPERATION_KEY,
      expect.objectContaining({
        message: '사용자 요청',
        metadata: expect.objectContaining({
          errorCode: 'user_cancelled',
          errorMessage: '사용자 요청',
          cancel: expect.objectContaining({
            requestedByUserId: 'user-1',
            reason: '사용자 요청',
          }),
        }),
      }),
    );
    expect(result).toEqual({
      status: 'cancelled',
      jobId: TASK_ID,
      operationKey: OPERATION_KEY,
      preserved: false,
    });
  });

  it('does not call the provider when the task was cancelled before processing', async () => {
    const { service, executor, operationAlerts } = makeService();
    operationAlerts.findByOperationKey.mockResolvedValueOnce(makeAlert('cancelled'));

    await runProcess(service, {
      organizationId: ORG,
      taskId: TASK_ID,
      operationKey: OPERATION_KEY,
      payload: { image_url: 'https://example.com/a.png', preset: 'enhance' },
    });

    expect(executor.execute).not.toHaveBeenCalled();
    expect(operationAlerts.succeed).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('ignores a late success when the task is cancelled during provider execution', async () => {
    const { service, operationAlerts } = makeService();
    operationAlerts.findByOperationKey
      .mockResolvedValueOnce(makeAlert('running'))
      .mockResolvedValueOnce(makeAlert('cancelled'));

    await runProcess(service, {
      organizationId: ORG,
      taskId: TASK_ID,
      operationKey: OPERATION_KEY,
      payload: { image_url: 'https://example.com/a.png', preset: 'enhance' },
    });

    expect(operationAlerts.succeed).not.toHaveBeenCalled();
  });

  it('ignores a late failure when the task is cancelled during provider execution', async () => {
    const { service, executor, operationAlerts } = makeService();
    executor.execute.mockRejectedValueOnce(new Error('provider failed'));
    operationAlerts.findByOperationKey
      .mockResolvedValueOnce(makeAlert('running'))
      .mockResolvedValueOnce(makeAlert('cancelled'));

    await runProcess(service, {
      organizationId: ORG,
      taskId: TASK_ID,
      operationKey: OPERATION_KEY,
      payload: { image_url: 'https://example.com/a.png', preset: 'enhance' },
    });

    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });
});
