import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  AgentVersionNameSchema,
  parseAgentVersionName,
} from "@kiditem/shared/identifiers";
import {
  AGENT_VERSION_REPOSITORY,
  type AgentVersionRepositoryPort,
} from "../../port/out/repository/agent-version.repository.port";
import type { ActiveAgentVersionRecord } from "../../port/out/repository/interaction/agent-interaction.persistence.types";
import { AgentOsBoundaryError } from "../../../domain/agent-os.errors";
import { listAgentDefinitions } from "../../../domain/agent-definition.registry";
import { FOUNDATION_CAPABILITY_KEYS } from "./interaction-authority-profile";

/** Capability-internal fail-closed resolver for active interaction versions. */
@Injectable()
export class InteractionAllowedVersionResolver {
  constructor(
    @Inject(AGENT_VERSION_REPOSITORY)
    private readonly repository: AgentVersionRepositoryPort,
  ) {}

  async resolveAll(): Promise<ActiveAgentVersionRecord[]> {
    const activeDefinitions = new Set(
      listAgentDefinitions()
        .filter((definition) => definition.catalogStatus === "active")
        .map((definition) => definition.type),
    );
    const matched = (await this.repository.listActiveAgentVersions()).filter(
      (version) =>
        this.isAllowed(version) &&
        activeDefinitions.has(definitionType(version.agentDefinitionKey)),
    );
    const seenDefinitions = new Set<string>();
    for (const version of matched) {
      const mappedDefinition = definitionType(version.agentDefinitionKey);
      if (
        seenDefinitions.has(mappedDefinition) ||
        seenDefinitions.has(version.agentDefinitionKey)
      ) {
        throw boundary(
          "AGENT_VERSION_AMBIGUOUS",
          "Multiple active versions map to the same interaction agent.",
        );
      }
      seenDefinitions.add(mappedDefinition);
      seenDefinitions.add(version.agentDefinitionKey);
      if (!version.modelIdentity.trim()) {
        throw boundary(
          "AGENT_MODEL_NOT_CONFIGURED",
          "An active AgentVersion has no explicit model identity.",
        );
      }
      if (!version.runtimeType.trim()) {
        throw boundary(
          "AGENT_RUNTIME_NOT_CONFIGURED",
          "An active AgentVersion has no explicit runtime type.",
        );
      }
      if (
        version.agentDefinitionKey === "operator" &&
        !hasExactFoundationCapabilities(version.capabilityKeys)
      ) {
        throw boundary(
          "AGENT_POLICY_NOT_CONFIGURED",
          "The active Operator AgentVersion does not declare the immutable foundation capability profile.",
        );
      }
    }
    if (
      matched.filter((version) => version.agentDefinitionKey === "operator")
        .length !== 1
    ) {
      throw boundary(
        "AGENT_OPERATOR_NOT_CONFIGURED",
        "Exactly one active Operator AgentVersion is required.",
      );
    }
    return matched.sort(
      (left, right) =>
        Number(right.agentDefinitionKey === "operator") -
          Number(left.agentDefinitionKey === "operator") ||
        left.agentDefinitionKey.localeCompare(right.agentDefinitionKey),
    );
  }

  async resolveFromName(
    agentVersionName: z.infer<typeof AgentVersionNameSchema>,
  ): Promise<ActiveAgentVersionRecord | null> {
    const parsed = parseAgentVersionName(agentVersionName);
    const listed = (await this.resolveAll()).find(
      (version) =>
        version.agentDefinitionKey === parsed.agentDefinitionKey &&
        String(version.version) === parsed.version,
    );
    return listed
      ? this.resolveById(parsed.agentDefinitionKey, listed.id)
      : null;
  }

  async resolveById(
    agentDefinitionKey: string,
    agentVersionId: string,
  ): Promise<ActiveAgentVersionRecord | null> {
    const version = await this.repository.findActiveAgentVersion({
      agentDefinitionKey,
      agentVersionId,
    });
    return version && this.isAllowed(version) ? version : null;
  }

  /** Existing sessions are pinned to a known immutable definition version. */
  async resolveKnownById(
    agentDefinitionKey: string,
    agentVersionId: string,
  ): Promise<ActiveAgentVersionRecord | null> {
    const version = await this.repository.findKnownAgentVersion({
      agentDefinitionKey,
      agentVersionId,
    });
    return version && version.activatedAt ? version : null;
  }

  private isAllowed(version: ActiveAgentVersionRecord): boolean {
    return Boolean(version.activatedAt) && version.retiredAt === null;
  }
}

function definitionType(agentDefinitionKey: string): string {
  return agentDefinitionKey === "operator" ? "manager" : agentDefinitionKey;
}

function hasExactFoundationCapabilities(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === FOUNDATION_CAPABILITY_KEYS.length &&
    value.every((key, index) => key === FOUNDATION_CAPABILITY_KEYS[index])
  );
}

function boundary(code: string, message: string): AgentOsBoundaryError {
  return new AgentOsBoundaryError(code, message);
}
