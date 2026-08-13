/**
 * Idempotent seed for Agent OS per-organization runtime instances.
 *
 * This file lives under `src/` so production Docker images can run the same
 * seed entrypoint before Office starts a new API image. The root
 * `scripts/seed-agent-os.ts` wrapper calls this module for local/dev usage.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FilesystemAgentRuntimeManifestCatalog } from './adapter/out/runtime/filesystem-agent-runtime-manifest-catalog';
import { PrismaClientAgentVersionRepository } from './adapter/out/repository/prisma-agent-version.repository';
import { AgentVersionPublisher } from './application/service/agent-version-publisher.service';
import {
  listAgentDefinitions,
  resolveDefinitionDefaultModel,
  resolveDefinitionModelPlan,
} from './domain/agent-definition.registry';
import type { AgentDefinitionRecord } from './domain/agent-os.types';

export interface AgentOsSeedResult {
  organizationCount: number;
  definitionCount: number;
  versionsPublished: number;
  instancesEnsured: number;
}

const FOUNDATION_AUTHORITY_PROFILE_VERSION_ID =
  'foundation_read_only_probe:v1';
const FOUNDATION_AUTHORITY_CAPABILITY_KEYS = [
  'agent_os.platform_probe',
  'analytics.readOverview',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.inspectRecommendationRun',
] as const;

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

export function resolveAgentOsRepositoryRoot(
  moduleDirectory = __dirname,
): string {
  return resolve(moduleDirectory, '../../../..');
}

const SOURCING_ADAPTER_TYPES = ['claude_cli', 'codex_cli'] as const;

export function resolveSeedAdapterType(
  definition: AgentDefinitionRecord,
): string {
  if (definition.type !== 'sourcing') return definition.defaultAdapterType;
  const configured = process.env.AGENT_SOURCING_ADAPTER_TYPE?.trim();
  if (!configured) return definition.defaultAdapterType;
  if (
    !SOURCING_ADAPTER_TYPES.includes(
      configured as (typeof SOURCING_ADAPTER_TYPES)[number],
    )
  ) {
    throw new Error(
      'AGENT_SOURCING_ADAPTER_TYPE must be claude_cli or codex_cli.',
    );
  }
  return configured;
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

async function ensureInstance(
  prisma: PrismaClient,
  organizationId: string,
  definition: AgentDefinitionRecord,
) {
  const adapterType = resolveSeedAdapterType(definition);
  const existing = await prisma.agentInstance.findFirst({
    where: { organizationId, type: definition.type },
    select: { id: true },
  });
  if (existing) {
    await prisma.agentInstance.update({
      where: { id: existing.id },
      data: {
        name: definition.name,
        adapterType,
      },
    });
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
        adapterType,
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

async function ensureAuthorityProfile(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  const policyDocument = {
    authorityClass: FOUNDATION_AUTHORITY_PROFILE_VERSION_ID,
    capabilityKeys: FOUNDATION_AUTHORITY_CAPABILITY_KEYS,
  };
  const policyHash = createHash('sha256')
    .update(canonicalJson(policyDocument))
    .digest('hex');
  const persisted = await prisma.agentAuthorityProfileVersion.upsert({
    where: {
      id_organizationId: {
        id: FOUNDATION_AUTHORITY_PROFILE_VERSION_ID,
        organizationId,
      },
    },
    create: {
      id: FOUNDATION_AUTHORITY_PROFILE_VERSION_ID,
      organizationId,
      profileKey: 'foundation_read_only_probe',
      version: 1,
      capabilityKeys: [...FOUNDATION_AUTHORITY_CAPABILITY_KEYS],
      policyDocument,
      policyHash,
    },
    update: {},
  });
  if (
    persisted.profileKey !== 'foundation_read_only_probe' ||
    persisted.version !== 1 ||
    persisted.policyHash !== policyHash ||
    canonicalJson(persisted.capabilityKeys) !==
      canonicalJson(FOUNDATION_AUTHORITY_CAPABILITY_KEYS) ||
    canonicalJson(persisted.policyDocument) !== canonicalJson(policyDocument)
  ) {
    throw new Error(
      `Authority profile version drift: ${FOUNDATION_AUTHORITY_PROFILE_VERSION_ID} for organization ${organizationId}`,
    );
  }
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  throw new Error('Authority profile policy must be JSON.');
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
  const manifestCatalog = new FilesystemAgentRuntimeManifestCatalog(
    resolveAgentOsRepositoryRoot(),
  );
  const versions = await manifestCatalog.compileAll();
  const publisher = new AgentVersionPublisher(
    new PrismaClientAgentVersionRepository(prisma),
  );
  for (const version of versions) {
    await publisher.publishAndActivate(version);
  }

  let instances = 0;
  for (const orgId of orgIds) {
    await ensureAuthorityProfile(prisma, orgId);
    for (const definition of definitions) {
      await ensureInstance(prisma, orgId, definition);
      instances += 1;
    }
  }

  return {
    organizationCount: orgIds.length,
    definitionCount: definitions.length,
    versionsPublished: versions.length,
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
    console.log(`  versions published: ${result.versionsPublished}`);
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
