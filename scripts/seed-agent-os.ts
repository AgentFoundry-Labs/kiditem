/**
 * scripts/seed-agent-os.ts
 *
 * Idempotent seed for Agent OS per-organization runtime instances.
 *
 * Without this, every Agent OS consumer (rules/evaluate, ai/image-edit,
 * ad-agent/run, sourcing detail-page generation, chat) returns
 * `agent_instance_not_found` because the organization has no runnable
 * instance for the code-owned definition.
 *
 * What this seed creates (idempotent):
 * 1. Validates every shipped code-owned agent definition has an explicit
 *    model env (`AGENT_<TYPE>_MODEL` or `AGENT_DEFAULT_MODEL`).
 * 2. One `AgentInstance` per definition per organization, with the matching
 *    `AgentRuntimeState` row created via the same upsert path the catalog
 *    service uses.
 *
 * Usage:
 *   npx tsx scripts/seed-agent-os.ts
 *   AGENT_SEED_ORG_IDS=<uuid1>,<uuid2> npx tsx scripts/seed-agent-os.ts
 *
 * If `AGENT_SEED_ORG_IDS` is unset, the script seeds for every active
 * Organization (intended for dev/local). Set the env var explicitly in
 * staging/CI to scope.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  listAgentDefinitions,
  resolveDefinitionDefaultModel,
} from '../apps/server/src/agent-os/domain/agent-definition.registry';
import type { AgentDefinitionRecord } from '../apps/server/src/agent-os/domain/agent-os.types';

config({ path: resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Missing DATABASE_URL: Agent OS seed requires a database connection.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

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
      create: { organizationId, agentInstanceId: existing.id },
      update: {},
    });
    return existing;
  }
  return prisma.$transaction(async (tx) => {
    const instance = await tx.agentInstance.create({
      data: {
        organizationId,
        type: definition.type,
        name: definition.name,
        adapterType: definition.defaultAdapterType,
      },
      select: { id: true },
    });
    await tx.agentRuntimeState.create({
      data: { organizationId, agentInstanceId: instance.id },
    });
    return instance;
  });
}

async function main() {
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
    console.error('No active organizations found and AGENT_SEED_ORG_IDS unset. Nothing to seed.');
    process.exitCode = 1;
    return;
  }

  console.log(`Seeding Agent OS for ${orgIds.length} organization(s).`);

  const definitions = listAgentDefinitions();
  for (const definition of definitions) {
    resolveDefaultModel(definition);
  }
  console.log(`  definitions validated: ${definitions.length}`);

  let instances = 0;
  for (const orgId of orgIds) {
    for (const definition of definitions) {
      await ensureInstance(orgId, definition);
      instances += 1;
    }
  }
  console.log(`  instances ensured: ${instances}`);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
