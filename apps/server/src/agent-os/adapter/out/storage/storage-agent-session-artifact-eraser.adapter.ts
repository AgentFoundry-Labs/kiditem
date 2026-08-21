import { Inject, Injectable } from "@nestjs/common";
import { StorageService } from "../../../../common/storage/storage.service";
import type {
  AgentSessionArtifactEraserPort,
  AgentSessionArtifactEraseResult,
} from "../../../application/port/out/storage/agent-session-artifact-eraser.port";

@Injectable()
export class StorageAgentSessionArtifactEraser
  implements AgentSessionArtifactEraserPort
{
  constructor(
    @Inject(StorageService)
    private readonly storage: Pick<StorageService, "extractKey" | "delete">,
  ) {}

  async erase(input: {
    storageReference: string;
  }): Promise<AgentSessionArtifactEraseResult> {
    const key = this.storage.extractKey(input.storageReference);
    if (!isOwnedArtifactKey(key)) {
      return { outcome: "retry", errorCode: "unsupported_reference" };
    }
    try {
      await this.storage.delete(key);
      return { outcome: "erased" };
    } catch {
      return { outcome: "retry", errorCode: "storage_delete_failed" };
    }
  }
}

function isOwnedArtifactKey(key: string | null): key is string {
  if (!key?.startsWith("agent-artifacts/")) return false;
  const suffix = key.slice("agent-artifacts/".length);
  return suffix.length > 0 && suffix.split("/").every((part) => part && part !== "." && part !== "..");
}
