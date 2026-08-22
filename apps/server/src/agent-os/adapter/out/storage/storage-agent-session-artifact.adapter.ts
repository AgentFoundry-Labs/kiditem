import { Injectable } from '@nestjs/common';
import { StorageService } from '../../../../common/storage/storage.service';
import type { AgentSessionArtifactStoragePort } from '../../../application/port/out/storage/agent-session-artifact-storage.port';

@Injectable()
export class StorageAgentSessionArtifactAdapter
  implements AgentSessionArtifactStoragePort
{
  private readonly cleanupByKey = new Map<string, Promise<
    { state: 'erased' } | { state: 'present' } | { state: 'unknown' }
  >>();

  constructor(private readonly storage: StorageService) {}

  async openMultipart(input: {
    key: string;
    mimeType: string;
    signal: AbortSignal;
  }): Promise<{ uploadId: string }> {
    return this.storage.openMultipartUpload(input);
  }

  async uploadAndComplete(input: {
    key: string;
    uploadId: string;
    bytes: Uint8Array;
    signal: AbortSignal;
  }): Promise<void> {
    await this.storage.uploadAndCompleteMultipart(input);
  }

  async verifyCompleted(input: {
    key: string;
    expectedSha256: string;
    expectedByteLength: number;
    maxByteLength: number;
    signal: AbortSignal;
  }): Promise<void> {
    await this.storage.verifyOwnedObjectSha256(input);
  }

  async abortEraseAndConfirm(input: {
    key: string;
    uploadId: string | null;
    signal: AbortSignal;
  }): Promise<{ state: 'erased' } | { state: 'present' } | { state: 'unknown' }> {
    const existing = this.cleanupByKey.get(input.key);
    if (existing) return existing;
    const cleanup = this.eraseAfterFencing(input);
    this.cleanupByKey.set(input.key, cleanup);
    void cleanup.then((result) => {
      if (result.state !== 'erased' && this.cleanupByKey.get(input.key) === cleanup) {
        this.cleanupByKey.delete(input.key);
      }
    }, () => {
      if (this.cleanupByKey.get(input.key) === cleanup) this.cleanupByKey.delete(input.key);
    });
    return cleanup;
  }

  async inspect(input: {
    key: string;
    signal: AbortSignal;
  }): Promise<'present' | 'erased' | 'unknown'> {
    try {
      return await this.storage.headOwnedObject(input);
    } catch {
      return 'unknown';
    }
  }

  private async eraseAfterFencing(
    input: { key: string; uploadId: string | null; signal: AbortSignal },
  ): Promise<{ state: 'erased' } | { state: 'present' } | { state: 'unknown' }> {
    try {
      const barrier = await this.storage.fenceOwnedMultipartOperations({
        key: input.key,
        signal: input.signal,
      });
      // A request which completed after the fence can recreate the exact key.
      // Do not collapse that ambiguity into a successful erasure; a later
      // retry will fence an idle provider and perform the deletion.
      if (barrier !== 'quiescent') return { state: 'unknown' };
      const uploadIds = new Set<string>();
      if (input.uploadId) uploadIds.add(input.uploadId);
      for (;;) {
        for (const upload of await this.storage.listExactMultipartUploads(input.key, input.signal)) {
          uploadIds.add(upload.uploadId);
        }
        if (uploadIds.size === 0) break;
        for (const uploadId of uploadIds) {
          try {
            await this.storage.abortMultipartUpload({
              key: input.key,
              uploadId,
              signal: input.signal,
            });
          } catch (error) {
            // A provider can serialize an old completion before this abort.
            // Its NoSuchUpload response proves no multipart invocation remains;
            // delete/head must now erase the completed exact key. Any other
            // provider result remains ambiguous and fails closed.
            if (!isMissingMultipartUpload(error)) return { state: 'unknown' };
          }
        }
        uploadIds.clear();
        const remaining = await this.storage.listExactMultipartUploads(input.key, input.signal);
        if (remaining.length === 0) break;
        return { state: 'unknown' };
      }
      await this.storage.deleteOwnedObject({ key: input.key, signal: input.signal });
      return (await this.storage.headOwnedObject({ key: input.key, signal: input.signal })) === 'erased'
        ? { state: 'erased' }
        : { state: 'present' };
    } catch {
      return { state: 'unknown' };
    }
  }

}

function isMissingMultipartUpload(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  return name === 'NoSuchUpload';
}
