import { describe, expect, it, vi } from 'vitest';
import { StorageAgentSessionArtifactAdapter } from '../storage-agent-session-artifact.adapter';

describe('StorageAgentSessionArtifactAdapter', () => {
  it('fails closed without touching generic S3-compatible cleanup primitives', async () => {
    const key = 'agent-artifacts/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
    const storage = {
      listExactMultipartUploads: vi.fn(async () => []),
      abortMultipartUpload: vi.fn(),
      deleteOwnedObject: vi.fn(),
      headOwnedObject: vi.fn(async () => 'erased' as const),
    };
    const adapter = new StorageAgentSessionArtifactAdapter(storage as never);

    await expect(adapter.abortEraseAndConfirm({
      key,
      uploadId: null,
      signal: AbortSignal.timeout(1_000),
    })).resolves.toEqual({ state: 'unknown' });
    expect(storage.listExactMultipartUploads).not.toHaveBeenCalled();
    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(storage.deleteOwnedObject).not.toHaveBeenCalled();
    expect(storage.headOwnedObject).not.toHaveBeenCalled();
  });

  it('preserves lifecycle cancellation instead of relabeling it as cleanup unknown', async () => {
    const controller = new AbortController();
    const reason = new Error('operation_server_shutdown');
    controller.abort(reason);
    const adapter = new StorageAgentSessionArtifactAdapter({} as never);

    await expect(adapter.abortEraseAndConfirm({
      key: 'agent-artifacts/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333',
      uploadId: null,
      signal: controller.signal,
    })).rejects.toBe(reason);
  });
});
