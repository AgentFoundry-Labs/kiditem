import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT,
  type AgentRuntimeCredentialVerificationPort,
} from "../../port/in/session-execution/agent-runtime-credential-verification.port";
import {
  AGENT_RUNTIME_CREDENTIAL_AUTHORITY_REPOSITORY,
  type AgentRuntimeCredentialAuthorityRepositoryPort,
} from "../../port/out/repository/session-execution/agent-runtime-credential-authority.repository.port";
import { RuntimeCredentialBroker } from "../../../adapter/out/runtime/runtime-credential-broker";

@Injectable()
export class AgentRuntimeCredentialVerificationService implements AgentRuntimeCredentialVerificationPort {
  constructor(
    private readonly broker: RuntimeCredentialBroker,
    @Inject(AGENT_RUNTIME_CREDENTIAL_AUTHORITY_REPOSITORY)
    private readonly authority: AgentRuntimeCredentialAuthorityRepositoryPort,
  ) {}

  async verify(input: { token: string }) {
    const claims = this.broker.verify(input.token);
    const current = await this.authority.loadRuntimeCredentialAuthority(claims);
    if (
      !current ||
      current.lifecycle !== "active" ||
      current.startIntentId !== claims.startIntentId ||
      current.runtimeCredentialGeneration !== claims.runtimeCredentialGeneration
    ) {
      throw new Error("RUNTIME_CREDENTIAL_REVOKED");
    }
    return {
      organizationId: claims.organizationId,
      sessionId: claims.sessionId,
      executionId: claims.executionId,
      attemptId: claims.attemptId,
      startIntentId: claims.startIntentId,
      runtimeCredentialGeneration: claims.runtimeCredentialGeneration,
    };
  }
}

export { AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT };
