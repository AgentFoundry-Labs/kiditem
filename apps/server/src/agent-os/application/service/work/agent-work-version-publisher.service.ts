import type { PrismaClient } from '@prisma/client';
import type { AgentVersionPublicationDefinition } from '../../../domain/catalog/agent-version-publication.registry';

export class AgentVersionPublisher {
  constructor(private readonly prisma: PrismaClient) {}

  async publish(input: AgentVersionPublicationDefinition) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const same = await tx.agentVersion.findFirst({
          where: { agentDefinitionKey: input.agentDefinitionKey, manifestHash: input.manifestHash, activatedAt: { not: null }, retiredAt: null },
        });
        if (same) return same;
        const latest = await tx.agentVersion.aggregate({
          where: { agentDefinitionKey: input.agentDefinitionKey }, _max: { version: true },
        });
        const now = new Date();
        await tx.agentVersion.updateMany({
          where: { agentDefinitionKey: input.agentDefinitionKey, activatedAt: { not: null }, retiredAt: null },
          data: { retiredAt: now },
        });
        return tx.agentVersion.create({
          data: {
            agentDefinitionKey: input.agentDefinitionKey,
            version: (latest._max.version ?? 0) + 1,
            assignedDomains: [...input.assignedDomains],
            capabilityKeys: [...input.capabilityKeys],
            runtimeType: input.runtimeType,
            instructionProfileRef: input.instructionProfileRef,
            manifestHash: input.manifestHash,
            activatedAt: now,
          },
        });
      });
    } catch (error: unknown) {
      const raced = await this.prisma.agentVersion.findFirst({
        where: { agentDefinitionKey: input.agentDefinitionKey, manifestHash: input.manifestHash, activatedAt: { not: null }, retiredAt: null },
      });
      if (raced) return raced;
      throw error;
    }
  }
}
