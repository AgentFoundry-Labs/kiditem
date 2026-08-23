import { Inject, Injectable } from "@nestjs/common";
import {
  AllowedAgentSchema,
  InteractionBootstrapSchema,
  type InteractionBootstrap,
} from "@kiditem/shared/agent-interaction";
import {
  AgentDefinitionKeySchema,
  AgentVersionKeySchema,
  formatAgentVersionName,
} from "@kiditem/shared/identifiers";
import {
  AGENT_SESSION_QUERY_REPOSITORY,
  type AgentSessionQueryRepositoryPort,
} from "../../port/out/repository/interaction/agent-session-query.repository.port";
import type { ActiveAgentVersionRecord } from "../../port/out/repository/interaction/agent-interaction.persistence.types";
import type {
  AgentInteractionBootstrapPort,
  InteractionPrincipalInput,
} from "../../port/in/interaction/agent-interaction-bootstrap.port";
import { InteractionAllowedVersionResolver } from "./interaction-allowed-version-resolver";

/** Lists browser-visible interaction metadata. Authorization starts only at run/connect. */
@Injectable()
export class AgentInteractionBootstrapService implements AgentInteractionBootstrapPort {
  constructor(
    @Inject(AGENT_SESSION_QUERY_REPOSITORY)
    private readonly repository: AgentSessionQueryRepositoryPort,
    private readonly versions: InteractionAllowedVersionResolver,
  ) {}

  async bootstrap(input: InteractionPrincipalInput): Promise<InteractionBootstrap> {
    const versions = await this.versions.resolveAll();
    const sessions = await this.repository.listSessions({
      organizationId: input.organizationId,
      userId: input.userId,
      limit: 50,
    });
    return InteractionBootstrapSchema.parse({
      defaultAgentDefinitionKey: AgentDefinitionKeySchema.parse("operator"),
      agents: versions.map((version) => this.allowedAgent(version)),
      sessions,
    });
  }

  private allowedAgent(version: ActiveAgentVersionRecord) {
    const definition = AgentDefinitionKeySchema.parse(version.agentDefinitionKey);
    return AllowedAgentSchema.parse({
      agentDefinitionKey: definition,
      agentVersion: formatAgentVersionName(
        definition,
        AgentVersionKeySchema.parse(String(version.version)),
      ),
      displayName: version.displayName,
      description: version.description,
      isDefault: version.agentDefinitionKey === "operator",
    });
  }
}
