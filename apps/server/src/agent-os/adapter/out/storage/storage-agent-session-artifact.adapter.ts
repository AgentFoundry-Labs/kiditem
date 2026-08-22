import { Injectable } from "@nestjs/common";
import { StorageService } from "../../../../common/storage/storage.service";
import type { AgentSessionArtifactStoragePort } from "../../../application/port/out/storage/agent-session-artifact-storage.port";

@Injectable()
export class StorageAgentSessionArtifactAdapter implements AgentSessionArtifactStoragePort {
  constructor(private readonly storage: StorageService) {}

  materializationCapability(): "unsupported" {
    return this.storage.agentSessionMultipartCleanupCapability();
  }

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
  }): Promise<
    { state: "erased" } | { state: "present" } | { state: "unknown" }
  > {
    input.signal.throwIfAborted();
    return { state: "unknown" };
  }

  async deleteActiveAndConfirm(input: {
    key: string;
    signal: AbortSignal;
  }): Promise<
    { state: "erased" } | { state: "present" } | { state: "unknown" }
  > {
    input.signal.throwIfAborted();
    try {
      await this.storage.deleteOwnedObject(input);
      const state = await this.storage.headOwnedObject(input);
      return state === "erased" ? { state } : { state };
    } catch (error) {
      if (input.signal.aborted) throw input.signal.reason;
      return { state: "unknown" };
    }
  }

  async inspect(input: {
    key: string;
    signal: AbortSignal;
  }): Promise<"present" | "erased" | "unknown"> {
    try {
      return await this.storage.headOwnedObject(input);
    } catch {
      return "unknown";
    }
  }
}
