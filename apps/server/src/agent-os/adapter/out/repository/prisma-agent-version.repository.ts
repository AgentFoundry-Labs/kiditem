import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import type {
  AgentVersionRepositoryPort,
  PublishAgentVersionInput,
  PublishedAgentVersionRecord,
} from "../../../application/port/out/repository/agent-version.repository.port";
import type {
  ActiveAgentVersionRecord,
  FindActiveAgentVersionInput,
} from "../../../application/port/out/repository/interaction/agent-interaction.persistence.types";

const activeInteractionVersionSelect = {
  id: true,
  agentDefinitionKey: true,
  version: true,
  displayName: true,
  description: true,
  runtimeType: true,
  modelIdentity: true,
  capabilityKeys: true,
  policyDocument: true,
  activatedAt: true,
  retiredAt: true,
} as const;

@Injectable()
export class PrismaAgentVersionRepository implements AgentVersionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  publishAndActivate(
    input: PublishAgentVersionInput,
  ): Promise<PublishedAgentVersionRecord> {
    return publishAndActivate(this.prisma, input);
  }

  async findActiveByDefinitionKey(agentDefinitionKey: string) {
    return this.prisma.agentVersion.findFirst({
      where: {
        agentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      select: { manifestHash: true },
    });
  }

  listActiveAgentVersions(): Promise<ActiveAgentVersionRecord[]> {
    return this.prisma.agentVersion.findMany({
      where: { activatedAt: { not: null }, retiredAt: null },
      select: activeInteractionVersionSelect,
      orderBy: [
        { agentDefinitionKey: "asc" },
        { version: "asc" },
        { id: "asc" },
      ],
    }) as Promise<ActiveAgentVersionRecord[]>;
  }

  findActiveAgentVersion(
    input: FindActiveAgentVersionInput,
  ): Promise<ActiveAgentVersionRecord | null> {
    return this.prisma.agentVersion.findFirst({
      where: {
        id: input.agentVersionId,
        agentDefinitionKey: input.agentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      select: activeInteractionVersionSelect,
    }) as Promise<ActiveAgentVersionRecord | null>;
  }

  findKnownAgentVersion(
    input: FindActiveAgentVersionInput,
  ): Promise<ActiveAgentVersionRecord | null> {
    return this.prisma.agentVersion.findFirst({
      where: { id: input.agentVersionId, agentDefinitionKey: input.agentDefinitionKey },
      select: activeInteractionVersionSelect,
    }) as Promise<ActiveAgentVersionRecord | null>;
  }

  async probeHealth(): Promise<void> {
    await this.prisma.agentVersion.count({
      where: { activatedAt: { not: null }, retiredAt: null },
    });
  }
}

export class PrismaClientAgentVersionRepository implements AgentVersionRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  publishAndActivate(
    input: PublishAgentVersionInput,
  ): Promise<PublishedAgentVersionRecord> {
    return publishAndActivate(this.prisma, input);
  }

  async findActiveByDefinitionKey(agentDefinitionKey: string) {
    return this.prisma.agentVersion.findFirst({
      where: {
        agentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      select: { manifestHash: true },
    });
  }

  listActiveAgentVersions(): Promise<ActiveAgentVersionRecord[]> {
    return this.prisma.agentVersion.findMany({
      where: { activatedAt: { not: null }, retiredAt: null },
      select: activeInteractionVersionSelect,
      orderBy: [
        { agentDefinitionKey: "asc" },
        { version: "asc" },
        { id: "asc" },
      ],
    }) as Promise<ActiveAgentVersionRecord[]>;
  }
  findActiveAgentVersion(
    input: FindActiveAgentVersionInput,
  ): Promise<ActiveAgentVersionRecord | null> {
    return this.prisma.agentVersion.findFirst({
      where: {
        id: input.agentVersionId,
        agentDefinitionKey: input.agentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      select: activeInteractionVersionSelect,
    }) as Promise<ActiveAgentVersionRecord | null>;
  }
  findKnownAgentVersion(
    input: FindActiveAgentVersionInput,
  ): Promise<ActiveAgentVersionRecord | null> {
    return this.prisma.agentVersion.findFirst({
      where: { id: input.agentVersionId, agentDefinitionKey: input.agentDefinitionKey },
      select: activeInteractionVersionSelect,
    }) as Promise<ActiveAgentVersionRecord | null>;
  }
  async probeHealth(): Promise<void> {
    await this.prisma.agentVersion.count({
      where: { activatedAt: { not: null }, retiredAt: null },
    });
  }
}

export async function publishAndActivate(
  prisma: PrismaClient | PrismaService,
  input: PublishAgentVersionInput,
): Promise<PublishedAgentVersionRecord> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-version:${input.agentDefinitionKey}`}, 0))`,
    );

    const equal = await tx.agentVersion.findFirst({
      where: {
        agentDefinitionKey: input.agentDefinitionKey,
        manifestHash: input.manifestHash,
      },
    });
    if (equal?.activatedAt && equal.retiredAt === null) return toRecord(equal);

    if (equal) {
      const now = new Date();
      await tx.agentVersion.updateMany({
        where: {
          agentDefinitionKey: input.agentDefinitionKey,
          id: { not: equal.id },
          activatedAt: { not: null },
          retiredAt: null,
        },
        data: { retiredAt: now },
      });
      const reactivated = await tx.agentVersion.updateMany({
        where: {
          id: equal.id,
          agentDefinitionKey: input.agentDefinitionKey,
          manifestHash: input.manifestHash,
        },
        data: { activatedAt: now, retiredAt: null },
      });
      if (reactivated.count !== 1) {
        throw new Error(
          `Agent version disappeared while reactivating ${input.agentDefinitionKey}.`,
        );
      }
      const active = await tx.agentVersion.findFirstOrThrow({
        where: {
          id: equal.id,
          agentDefinitionKey: input.agentDefinitionKey,
          manifestHash: input.manifestHash,
          activatedAt: { not: null },
          retiredAt: null,
        },
      });
      return toRecord(active);
    }

    const latest = await tx.agentVersion.aggregate({
      where: { agentDefinitionKey: input.agentDefinitionKey },
      _max: { version: true },
    });
    const now = new Date();
    await tx.agentVersion.updateMany({
      where: {
        agentDefinitionKey: input.agentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      data: { retiredAt: now },
    });
    const created = await tx.agentVersion.create({
      data: {
        agentDefinitionKey: input.agentDefinitionKey,
        version: (latest._max.version ?? 0) + 1,
        displayName: input.displayName,
        description: input.description,
        runtimeType: input.runtimeType,
        modelIdentity: input.modelIdentity,
        capabilityKeys: input.capabilityKeys,
        policyDocument: input.policyDocument as Prisma.InputJsonValue,
        manifestHash: input.manifestHash,
        runtimeManifest: input.runtimeManifest as Prisma.InputJsonValue,
        activatedAt: now,
      },
    });
    return toRecord(created);
  });
}

function toRecord(row: {
  id: string;
  agentDefinitionKey: string;
  version: number;
  displayName: string;
  description: string;
  runtimeType: string;
  modelIdentity: string;
  capabilityKeys: Prisma.JsonValue;
  policyDocument: Prisma.JsonValue;
  manifestHash: string;
  runtimeManifest: Prisma.JsonValue;
  activatedAt: Date | null;
  retiredAt: Date | null;
}): PublishedAgentVersionRecord {
  return {
    id: row.id,
    agentDefinitionKey: row.agentDefinitionKey,
    version: row.version,
    displayName: row.displayName,
    description: row.description,
    runtimeType: row.runtimeType,
    modelIdentity: row.modelIdentity,
    capabilityKeys: row.capabilityKeys as string[],
    policyDocument: row.policyDocument as Record<string, unknown>,
    manifestHash: row.manifestHash,
    runtimeManifest:
      row.runtimeManifest as PublishedAgentVersionRecord["runtimeManifest"],
    activatedAt: row.activatedAt,
    retiredAt: row.retiredAt,
  };
}
