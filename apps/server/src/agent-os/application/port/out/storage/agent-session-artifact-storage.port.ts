export const AGENT_SESSION_ARTIFACT_STORAGE_PORT = Symbol(
  'AGENT_SESSION_ARTIFACT_STORAGE_PORT',
);

export interface AgentSessionArtifactStoragePort {
  openMultipart(input: {
    key: string;
    mimeType: string;
    signal: AbortSignal;
  }): Promise<{ uploadId: string }>;
  uploadAndComplete(input: {
    key: string;
    uploadId: string;
    bytes: Uint8Array;
    signal: AbortSignal;
  }): Promise<void>;
  verifyCompleted(input: {
    key: string;
    expectedSha256: string;
    expectedByteLength: number;
    maxByteLength: number;
    signal: AbortSignal;
  }): Promise<void>;
  abortEraseAndConfirm(input: {
    key: string;
    uploadId: string | null;
    signal: AbortSignal;
  }): Promise<{ state: 'erased' } | { state: 'present' } | { state: 'unknown' }>;
  inspect(input: {
    key: string;
    signal: AbortSignal;
  }): Promise<'present' | 'erased' | 'unknown'>;
}
