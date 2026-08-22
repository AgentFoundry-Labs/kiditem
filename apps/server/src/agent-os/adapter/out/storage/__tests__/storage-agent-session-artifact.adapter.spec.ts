import { describe, expect, it, vi } from 'vitest';
import { StorageAgentSessionArtifactAdapter } from '../storage-agent-session-artifact.adapter';

describe('StorageAgentSessionArtifactAdapter', () => {
  it('discovers and aborts an upload opened before its durable ID binding', async () => {
    const key = 'agent-artifacts/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
    const uploads = new Set(['orphan-upload']);
    const storage = {
      openMultipart: vi.fn(),
      uploadAndCompleteMultipart: vi.fn(),
      listExactMultipartUploads: vi.fn(async () => [...uploads].map((uploadId) => ({ key, uploadId }))),
      abortMultipartUpload: vi.fn(async ({ uploadId }: { uploadId: string }) => uploads.delete(uploadId)),
      deleteOwnedObject: vi.fn(async () => undefined),
      headOwnedObject: vi.fn(async () => 'erased' as const),
    };
    const adapter = new StorageAgentSessionArtifactAdapter(storage as never);

    await expect(adapter.abortEraseAndConfirm({
      key,
      uploadId: null,
      signal: AbortSignal.timeout(1_000),
    })).resolves.toEqual({ state: 'erased' });
    expect(storage.abortMultipartUpload).toHaveBeenCalledWith({ key, uploadId: 'orphan-upload', signal: expect.any(AbortSignal) });
    await expect(storage.listExactMultipartUploads(key)).resolves.toEqual([]);
  });

  it('does not claim erasure when exact-key multipart enumeration remains ambiguous', async () => {
    const key = 'agent-artifacts/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-3333-333333333333';
    const storage = {
      listExactMultipartUploads: vi.fn(async () => [{ key, uploadId: 'stuck-upload' }]),
      abortMultipartUpload: vi.fn(async () => undefined),
      deleteOwnedObject: vi.fn(),
      headOwnedObject: vi.fn(),
    };
    const adapter = new StorageAgentSessionArtifactAdapter(storage as never);

    await expect(adapter.abortEraseAndConfirm({
      key,
      uploadId: null,
      signal: AbortSignal.timeout(1_000),
    })).resolves.toEqual({ state: 'unknown' });
    expect(storage.deleteOwnedObject).not.toHaveBeenCalled();
  });
});
