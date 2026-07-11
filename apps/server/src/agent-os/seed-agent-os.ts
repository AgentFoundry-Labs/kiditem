/**
 * Idempotent seed for Agent OS per-organization runtime instances.
 *
 * This file lives under `src/` so production Docker images can run the same
 * seed entrypoint before staging starts a new API image. The root
 * `scripts/seed-agent-os.ts` wrapper calls this module for local/dev usage.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  listAgentDefinitions,
  resolveDefinitionDefaultModel,
  resolveDefinitionModelPlan,
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
    const hint = definition.defaultAdapterType === 'gemini_image'
      ? `set ${definition.defaultModelEnv} in .env for ${definition.defaultAdapterType}`
      : `set ${definition.defaultModelEnv} or AGENT_DEFAULT_MODEL in .env`;
    throw new Error(
      `Missing default model: ${hint} (no silent fallback).`,
    );
  }
  const modelPlan = resolveDefinitionModelPlan(definition, value);
  if (!modelPlan.modelPlan) {
    const missing = modelPlan.missingEnv
      ? `${modelPlan.missingEnv} (${modelPlan.missingRole} model)`
      : 'model plan';
    throw new Error(
      `Missing default model plan for ${definition.type}: set ${missing} in .env (no AI_* fallback for Agent OS).`,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactFields(value: unknown, expected: string[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) {
    return false;
  }
  return expected.every((field) => value.includes(field));
}

function isSeedUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002' ||
    !isRecord(error.meta)
  ) {
    return false;
  }

  const driverAdapterError = error.meta.driverAdapterError;
  if (!isRecord(driverAdapterError) || !isRecord(driverAdapterError.cause)) {
    return false;
  }
  const constraint = driverAdapterError.cause.constraint;
  if (!isRecord(constraint)) {
    return false;
  }

  return (
    (error.meta.modelName === 'AgentInstance' &&
      hasExactFields(constraint.fields, ['organization_id', 'type'])) ||
    (error.meta.modelName === 'AgentRuntimeState' &&
      hasExactFields(constraint.fields, ['agent_instance_id']))
  );
}

async function ensureInstance(
  prisma: PrismaClient,
  organizationId: string,
  definition: AgentDefinitionRecord,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const instance = await tx.agentInstance.upsert({
          where: {
            organizationId_type: {
              organizationId,
              type: definition.type,
            },
          },
          update: {},
          create: {
            organizationId,
            type: definition.type,
            name: definition.name,
            role: definition.defaultInstanceRole,
            title: definition.defaultInstanceTitle,
            adapterType: definition.defaultAdapterType,
          },
          select: { id: true },
        });

        await tx.agentRuntimeState.upsert({
          where: { agentInstanceId: instance.id },
          create: {
            organizationId,
            agentInstanceId: instance.id,
          },
          update: {},
        });

        return instance;
      });
    } catch (error) {
      if (!isSeedUniqueConflict(error) || attempt === 1) {
        throw error;
      }
    }
  }

  throw new Error(
    `Failed to ensure Agent OS instance ${definition.type} for ${organizationId}.`,
  );
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
