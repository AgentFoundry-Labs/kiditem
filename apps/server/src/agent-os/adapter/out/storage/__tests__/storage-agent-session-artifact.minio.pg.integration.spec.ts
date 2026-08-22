import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { StorageService } from '../../../../../common/storage/storage.service';
import { AgentSessionDeletionExecutionService } from '../../../../application/service/session-execution/agent-session-deletion-execution.service';
import { StorageAgentSessionArtifactAdapter } from '../storage-agent-session-artifact.adapter';

const BUCKET = 'agent-session-delete-barrier';
const KEY = 'agent-artifacts/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-3333-333333333333';

let container: StartedTestContainer | null = null;
let originalClient: S3Client | null = null;
let recreatedClient: S3Client | null = null;

beforeAll(async () => {
  container = await new GenericContainer('minio/minio:latest')
    .withEnvironment({
      MINIO_ROOT_USER: 'minioadmin',
      MINIO_ROOT_PASSWORD: 'minio-secret',
    })
    .withExposedPorts(9000)
    .withCommand(['server', '/data'])
    .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  const options = {
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minio-secret' },
    forcePathStyle: true,
  };
  originalClient = new S3Client(options);
  recreatedClient = new S3Client(options);
  await originalClient.send(new CreateBucketCommand({ Bucket: BUCKET }));
});

afterAll(async () => {
  originalClient?.destroy();
  recreatedClient?.destroy();
  await container?.stop();
  container = null;
  originalClient = null;
  recreatedClient = null;
});

describe('StorageAgentSessionArtifactAdapter (disposable MinIO)', () => {
  it('allows an active multipart completion when its exact key is absent', async () => {
    const storage = new StorageService({
      client: originalClient!,
      bucket: BUCKET,
      publicUrl: `http://unused/${BUCKET}`,
    });
    const key = `${KEY}-normal`;
    const upload = await storage.openMultipartUpload({
      key,
      mimeType: 'application/octet-stream',
      signal: AbortSignal.timeout(10_000),
    });

    await storage.uploadAndCompleteMultipart({
      key,
      uploadId: upload.uploadId,
      bytes: new Uint8Array([1, 2, 3]),
      signal: AbortSignal.timeout(10_000),
    });

    await expect(storage.headOwnedObject({ key, signal: AbortSignal.timeout(10_000) }))
      .resolves.toBe('present');
  });

  it('keeps generic cleanup unsupported when late Complete recreates after observed absence', async () => {
    const releaseOldCompletion = deferred<void>();
    const completionReachedClient = deferred<void>();
    originalClient!.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === CompleteMultipartUploadCommand.name) {
          completionReachedClient.resolve();
          await releaseOldCompletion.promise;
        }
        return next(args);
      },
      { step: 'finalizeRequest', name: 'defer-agent-session-test-complete' },
    );
    const original = new StorageService({
      client: originalClient!,
      bucket: BUCKET,
      publicUrl: `http://unused/${BUCKET}`,
    });
    const generic = new StorageService({
      client: recreatedClient!,
      bucket: BUCKET,
      publicUrl: `http://unused/${BUCKET}`,
    });
    const upload = await original.openMultipartUpload({
      key: KEY,
      mimeType: 'application/octet-stream',
      signal: AbortSignal.timeout(10_000),
    });
    const oldCompletion = original.uploadAndCompleteMultipart({
      key: KEY,
      uploadId: upload.uploadId,
      bytes: new Uint8Array([1, 2, 3]),
      signal: AbortSignal.timeout(10_000),
    });
    await completionReachedClient.promise;
    await generic.deleteOwnedObject({ key: KEY, signal: AbortSignal.timeout(10_000) });
    await expect(generic.headOwnedObject({ key: KEY, signal: AbortSignal.timeout(10_000) }))
      .resolves.toBe('erased');
    releaseOldCompletion.resolve();
    await expect(oldCompletion).resolves.toBeUndefined();
    await expect(generic.listExactMultipartUploads(KEY, AbortSignal.timeout(10_000)))
      .resolves.toEqual([]);
    await expect(generic.headOwnedObject({ key: KEY, signal: AbortSignal.timeout(10_000) }))
      .resolves.toBe('present');

    let graphDeleteStarted = false;
    const deleteGraphAndCheckpoint = vi.fn(async () => { graphDeleteStarted = true; });
    const execution = new AgentSessionDeletionExecutionService(
      {
        loadFencedSnapshot: vi.fn().mockResolvedValue({
          kind: 'ready',
          snapshot: {
            retryGeneration: 1,
            consumedAttempts: 1,
            runtimeAttempts: [],
            operationRuns: [],
            operationRunIds: ['44444444-4444-4444-8444-444444444444'],
            artifacts: [{
              artifactId: '33333333-3333-4333-8333-333333333333',
              materializationOperationRunId: '44444444-4444-4444-8444-444444444444',
              providerUploadId: upload.uploadId,
            }],
            closureDigest: 'provider-barrier',
          },
        }),
        terminalizeOwnedRun: vi.fn().mockResolvedValue(undefined),
        deleteGraphAndCheckpoint,
        hasGraphDeletedCheckpoint: vi.fn(),
      } as never,
      { fenceAndCancel: vi.fn().mockResolvedValue({ state: 'fenced' }) } as never,
      { cleanup: vi.fn() } as never,
      {
        beginFence: vi.fn().mockResolvedValue(undefined),
        confirmFenced: vi.fn().mockResolvedValue({ state: 'fenced' }),
      } as never,
      {
        abortEraseAndConfirm: (input: {
          key: string;
          uploadId: string | null;
          signal: AbortSignal;
        }) => new StorageAgentSessionArtifactAdapter(generic).abortEraseAndConfirm(input),
      } as never,
    );

    const result = await execution.execute({
      signal: AbortSignal.timeout(10_000),
      organizationId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      operationRunId: '55555555-5555-4555-8555-555555555555',
      attemptToken: 'attempt-token',
      enterEphemeralFinalization: vi.fn().mockResolvedValue({ signal: AbortSignal.timeout(10_000) }),
    });
    expect(generic.agentSessionMultipartCleanupCapability()).toBe('unsupported');
    expect(result).toEqual({
      kind: 'retryable',
      code: 'STORAGE_DELETE_UNKNOWN',
      consumedAttempts: 1,
    });
    expect(graphDeleteStarted).toBe(false);
    expect(deleteGraphAndCheckpoint).not.toHaveBeenCalled();
    await generic.deleteOwnedObject({ key: KEY, signal: AbortSignal.timeout(10_000) });
    await expect(generic.headOwnedObject({ key: KEY, signal: AbortSignal.timeout(10_000) }))
      .resolves.toBe('erased');
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
