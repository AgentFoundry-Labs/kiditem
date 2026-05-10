/**
 * Idempotent seed for Agent OS per-organization runtime instances.
 *
 * This file lives under `src/` so production Docker images can run the same
 * seed entrypoint before staging starts a new API image. The root
 * `scripts/seed-agent-os.ts` wrapper calls this module for local/dev usage.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  listAgentDefinitions,
  resolveDefinitionDefaultModel,
} from './domain/agent-definition.registry';
import type { AgentDefinitionRecord } from './domain/agent-os.types';

export interface AgentOsSeedResult {
  organizationCount: number;
  definitionCount: number;
  instancesEnsured: number;
}

export function loadAgentOsSeedEnv(cwd = process.cwd()): void {
  config({ path: resolve(cwd, '.env') });
}

export function createAgentOsSeedPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL: Agent OS seed requires a database connection.');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

function resolveDefaultModel(definition: AgentDefinitionRecord): string {
  // Per-definition env first, then a single shared fallback.
  const value = resolveDefinitionDefaultModel(definition);
  if (!value || value.length === 0) {
    throw new Error(
      `Missing default model: set ${definition.defaultModelEnv} or AGENT_DEFAULT_MODEL in .env (no silent fallback).`,
    );
  }
  return value;
}

async function ensureInstance(
  prisma: PrismaClient,
  organizationId: string,
  definition: AgentDefinitionRecord,
) {
  const existing = await prisma.agentInstance.findFirst({
    where: { organizationId, type: definition.type },
    select: { id: true },
  });
  if (existing) {
    // Ensure runtime state row exists (1:1 with instance).
    await prisma.agentRuntimeState.upsert({
      where: { agentInstanceId: existing.id },
      create: {
        organization: { connect: { id: organizationId } },
        agentInstance: { connect: { id: existing.id } },
      },
      update: {},
    });
    return existing;
  }
  return prisma.$transaction(async (tx) => {
    const instance = await tx.agentInstance.create({
      data: {
        organization: { connect: { id: organizationId } },
        type: definition.type,
        name: definition.name,
        adapterType: definition.defaultAdapterType,
      },
      select: { id: true },
    });
    await tx.agentRuntimeState.create({
      data: {
        organization: { connect: { id: organizationId } },
        agentInstance: { connect: { id: instance.id } },
      },
    });
    return instance;
  });
}

export async function seedAgentOs(prisma: PrismaClient): Promise<AgentOsSeedResult> {
  const orgIdsEnv = process.env.AGENT_SEED_ORG_IDS;
  let orgIds: string[];
  if (orgIdsEnv && orgIdsEnv.length > 0) {
    orgIds = orgIdsEnv.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const orgs = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    orgIds = orgs.map((o) => o.id);
  }

  if (orgIds.length === 0) {
    throw new Error('No active organizations found and AGENT_SEED_ORG_IDS unset. Nothing to seed.');
  }

  const definitions = listAgentDefinitions();
  for (const definition of definitions) {
    resolveDefaultModel(definition);
  }

  let instances = 0;
  for (const orgId of orgIds) {
    for (const definition of definitions) {
      await ensureInstance(prisma, orgId, definition);
      instances += 1;
    }
  }

  return {
    organizationCount: orgIds.length,
    definitionCount: definitions.length,
    instancesEnsured: instances,
  };
}

export async function runAgentOsSeed(): Promise<AgentOsSeedResult> {
  loadAgentOsSeedEnv();
  const prisma = createAgentOsSeedPrisma();
  try {
    const result = await seedAgentOs(prisma);
    console.log(`Seeding Agent OS for ${result.organizationCount} organization(s).`);
    console.log(`  definitions validated: ${result.definitionCount}`);
    console.log(`  instances ensured: ${result.instancesEnsured}`);
    console.log('Done.');
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runAgentOsSeed().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
