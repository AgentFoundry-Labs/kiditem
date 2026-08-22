import { Injectable } from '@nestjs/common';
import { StorageService } from '../../../../common/storage/storage.service';
import type { AgentSessionArtifactStoragePort } from '../../../application/port/out/storage/agent-session-artifact-storage.port';

@Injectable()
export class StorageAgentSessionArtifactAdapter
  implements AgentSessionArtifactStoragePort
{
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

  async abortEraseAndConfirm(input: {
    key: string;
    uploadId: string | null;
    signal: AbortSignal;
  }): Promise<{ state: 'erased' } | { state: 'present' } | { state: 'unknown' }> {
    try {
      const uploadIds = new Set<string>();
      if (input.uploadId) uploadIds.add(input.uploadId);
      for (;;) {
        for (const upload of await this.storage.listExactMultipartUploads(input.key, input.signal)) {
          uploadIds.add(upload.uploadId);
        }
        if (uploadIds.size === 0) break;
        for (const uploadId of uploadIds) {
          await this.storage.abortMultipartUpload({
            key: input.key,
            uploadId,
            signal: input.signal,
          });
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
}
