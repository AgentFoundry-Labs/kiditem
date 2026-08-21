import { Inject, Injectable } from "@nestjs/common";
import { StorageService } from "../../../../common/storage/storage.service";
import { isOwnedAgentSessionArtifactReference } from "../../../domain/session/agent-session-artifact-reference.policy";
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
    private readonly storage: Pick<StorageService, "delete">,
  ) {}

  async erase(input: {
    organizationId: string;
    storageReference: string;
  }): Promise<AgentSessionArtifactEraseResult> {
    if (!isOwnedAgentSessionArtifactReference(input.organizationId, input.storageReference)) {
      return { outcome: "quarantined", errorCode: "invalid_reference" };
    }
    try {
      await this.storage.delete(input.storageReference);
      return { outcome: "erased" };
    } catch {
      return { outcome: "retry", errorCode: "storage_delete_failed" };
    }
  }
}
