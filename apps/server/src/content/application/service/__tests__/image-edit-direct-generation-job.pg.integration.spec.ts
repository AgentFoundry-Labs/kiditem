import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../../../test-helpers/real-prisma';
import { aiDirectJobOperations } from '../../../__tests__/helpers/ai-direct-job-operations';
import { ImageEditDirectGenerationJobService } from '../image-edit-direct-generation-job.service';

const OUTPUT = { image_url: 'https://storage.example.com/output.png' };

/**
 * 이미지 편집 작업 = `content.image_edit` 실행 하나(KID-358). 화면(`GET /image-ai/tasks/:taskId`)이 읽는
 * 상태 · 결과 · 오류와 취소 판정을 실제 실행 행으로 잠근다. 입력 사진 저장은 저장소 경계라 그대로 돌려준다.
 */
describe('image edit task on the operation contract (PG integration)', () => {
  let prisma: PrismaClient;
  let jobs: ReturnType<typeof aiDirectJobOperations>['jobs'];
  let worker: { wake: ReturnType<typeof vi.fn> };
  let service: ImageEditDirectGenerationJobService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    process.env.AI_IMAGE_MODEL = 'gemini-image-model';
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    ({ jobs } = aiDirectJobOperations(prisma, { project: vi.fn(), projectFailure: vi.fn() }));
    worker = { wake: vi.fn() };
    const inputAssets = { persistImageEditInputs: vi.fn(async ({ payload }) => payload) };
    service = new ImageEditDirectGenerationJobService(jobs, inputAssets as never, worker as never);
  });

  const schedule = () => service.schedule({
    organizationId: ORG,
    triggeredByUserId: null,
    payload: { image_url: 'https://storage.example.com/input.png', preset: 'custom' },
  });
  const cancel = (taskId: string) => service.cancel({ organizationId: ORG, taskId, actorUserId: null, reason: '사용자 요청' });

  it('schedules one prepared job whose id is the task id, and wakes the worker', async () => {
    const { taskId } = await schedule();
    expect(worker.wake).toHaveBeenCalledTimes(1);
    await expect(prisma.operation.findUniqueOrThrow({ where: { id: taskId } })).resolves.toMatchObject({
      kind: 'content.image_edit', status: 'prepared', maxAttempts: 3,
    });
    await expect(service.getStatus(ORG, taskId)).resolves.toEqual({
      taskId, status: 'pending', output: null, errorCode: null, errorMessage: null,
    });
    await expect(service.getStatus('00000000-0000-4000-8000-000000000000', taskId)).resolves.toBeNull();
  });

  it('reads running while claimed and while the saved result waits for its finish, then succeeded with the output', async () => {
    const { taskId } = await schedule();
    const claimed = (await jobs.claim('worker-1'))!;
    await expect(service.getStatus(ORG, taskId)).resolves.toMatchObject({ status: 'running' });
    await jobs.saveResult(claimed.job, claimed.token, OUTPUT);
    await expect(service.getStatus(ORG, taskId)).resolves.toMatchObject({ status: 'running', output: null });
    await jobs.succeed(claimed.job, claimed.token);
    await expect(service.getStatus(ORG, taskId)).resolves.toEqual({
      taskId, status: 'succeeded', output: OUTPUT, errorCode: null, errorMessage: null,
    });
  });

  it('exposes a final failure through its code and message', async () => {
    const { taskId } = await schedule();
    const claimed = (await jobs.claim('worker-1'))!;
    await jobs.fail(claimed.job, claimed.token, { errorCode: 'provider_timeout', errorMessage: 'image provider timed out' });
    await expect(service.getStatus(ORG, taskId)).resolves.toEqual({
      taskId, status: 'failed', output: null, errorCode: 'provider_timeout', errorMessage: 'image provider timed out',
    });
  });

  it('cancels a waiting or running task; a finished task or one with a saved result is preserved', async () => {
    const waiting = await schedule();
    await expect(cancel(waiting.taskId)).resolves.toEqual({ status: 'cancelled', jobId: waiting.taskId, preserved: false });
    await expect(service.getStatus(ORG, waiting.taskId)).resolves.toMatchObject({ status: 'cancelled', errorCode: 'USER_CANCELLED' });

    const running = await schedule();
    await jobs.claim('worker-1');
    await expect(cancel(running.taskId)).resolves.toMatchObject({ status: 'cancelled' });

    const saved = await schedule();
    const claimed = (await jobs.claim('worker-1'))!;
    await jobs.saveResult(claimed.job, claimed.token, OUTPUT);
    await expect(cancel(saved.taskId)).resolves.toEqual({ status: 'already_terminal', jobId: saved.taskId, preserved: true });
    await expect(jobs.succeed(claimed.job, claimed.token)).resolves.toBe(true);
    await expect(cancel(saved.taskId)).resolves.toEqual({ status: 'already_terminal', jobId: saved.taskId, preserved: true });

    await expect(cancel('00000000-0000-4000-8000-000000000000')).resolves.toMatchObject({ status: 'not_found' });
  });
});
