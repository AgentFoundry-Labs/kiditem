/**
 * scripts/seed-agent-os.ts
 *
 * Idempotent seed for Agent OS v2 catalog + per-organization runtime instances.
 *
 * Without this, every Agent OS consumer (rules/evaluate, ai/image-edit,
 * ad-agent/run, sourcing detail-page generation, chat) returns
 * `agent_instance_not_found` because the catalog is empty.
 *
 * What this seed creates (idempotent):
 * 1. One `AgentBlueprint` per shipped agent type, pointing at the prompt path
 *    in `apps/server/agent-config/prompts/agents/*.md`. Default model comes
 *    from `AGENT_DEFAULT_MODEL` env (no silent fallback inside this script).
 * 2. One `AgentInstance` per blueprint per organization, with the matching
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

config({ path: resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Missing DATABASE_URL: Agent OS seed requires a database connection.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

interface BlueprintSeed {
  type: string;
  name: string;
  description: string;
  promptPath: string;
  defaultAdapterType: 'claude_local' | 'python_http';
  defaultModelEnv: string;
  defaultRuntimeConfig?: Record<string, unknown>;
  defaultCapabilities?: Record<string, unknown>;
}

const PROMPT_BASE = 'agent-config/prompts/agents';

const BLUEPRINTS: BlueprintSeed[] = [
  {
    type: 'manager',
    name: 'Manager Agent',
    description: '전사 데이터 분석/지시 에이전트',
    promptPath: `${PROMPT_BASE}/manager.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_MANAGER_MODEL',
  },
  {
    type: 'rules_evaluation',
    name: 'Rules Evaluation',
    description: '룰 평가 에이전트',
    promptPath: `${PROMPT_BASE}/rules-evaluation.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_RULES_EVALUATION_MODEL',
  },
  {
    type: 'rules_suggest',
    name: 'Rules Threshold Suggester',
    description: '룰 임계 제안 에이전트',
    promptPath: `${PROMPT_BASE}/rules-suggest.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_RULES_SUGGEST_MODEL',
  },
  {
    type: 'ad_strategy',
    name: 'Ad Strategy',
    description: '광고 전략 분석 에이전트',
    promptPath: `${PROMPT_BASE}/ad-strategy.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_AD_STRATEGY_MODEL',
  },
  {
    type: 'thumbnail_analyst',
    name: 'Thumbnail Analyst',
    description: '썸네일 컴플라이언스 분석 에이전트',
    promptPath: `${PROMPT_BASE}/thumbnail-analyst.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_THUMBNAIL_ANALYST_MODEL',
  },
  {
    type: 'image_edit',
    name: 'Image Edit',
    description: '이미지 편집 (background/text/replace) 에이전트',
    promptPath: `${PROMPT_BASE}/manager.md`, // image_edit prompt 미존재 — 임시로 manager 가리킨다 (실제 runtime 도입 시 분리)
    defaultAdapterType: 'python_http',
    defaultModelEnv: 'AGENT_IMAGE_EDIT_MODEL',
  },
  {
    type: 'thumbnail_auto_edit',
    name: 'Thumbnail Auto Edit',
    description: 'A 등급 cohort 자동 재편집 에이전트',
    promptPath: `${PROMPT_BASE}/thumbnail-analyst.md`,
    defaultAdapterType: 'python_http',
    defaultModelEnv: 'AGENT_THUMBNAIL_AUTO_EDIT_MODEL',
  },
  {
    type: 'chat',
    name: 'Chatbot',
    description: 'Operator chatbot — read-only DB context',
    promptPath: `${PROMPT_BASE}/chat.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_CHAT_MODEL',
  },
];

function resolveDefaultModel(envName: string): string {
  // Per-blueprint env first, then a single shared fallback.
  const value = process.env[envName] ?? process.env.AGENT_DEFAULT_MODEL;
  if (!value || value.length === 0) {
    throw new Error(
      `Missing default model: set ${envName} or AGENT_DEFAULT_MODEL in .env (no silent fallback).`,
    );
  }
  return value;
}

async function upsertBlueprint(seed: BlueprintSeed) {
  const defaultModel = resolveDefaultModel(seed.defaultModelEnv);
  const blueprint = await prisma.agentBlueprint.upsert({
    where: { type: seed.type },
    create: {
      type: seed.type,
      name: seed.name,
      description: seed.description,
      promptPath: seed.promptPath,
      defaultAdapterType: seed.defaultAdapterType,
      defaultModel,
      defaultRuntimeConfig: seed.defaultRuntimeConfig ?? {},
      defaultCapabilities: seed.defaultCapabilities ?? {},
      catalogStatus: 'active',
    },
    update: {
      name: seed.name,
      description: seed.description,
      promptPath: seed.promptPath,
      defaultAdapterType: seed.defaultAdapterType,
      defaultModel,
      defaultRuntimeConfig: seed.defaultRuntimeConfig ?? {},
      defaultCapabilities: seed.defaultCapabilities ?? {},
      catalogStatus: 'active',
    },
  });
  return blueprint;
}

async function ensureInstance(
  organizationId: string,
  blueprint: { id: string; type: string; name: string; defaultAdapterType: string; defaultRuntimeConfig: unknown },
) {
  const existing = await prisma.agentInstance.findFirst({
    where: { organizationId, type: blueprint.type },
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
        blueprintId: blueprint.id,
        type: blueprint.type,
        name: blueprint.name,
        adapterType: blueprint.defaultAdapterType,
        runtimeConfig: (blueprint.defaultRuntimeConfig ?? {}) as Record<string, unknown>,
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

  const blueprints = await Promise.all(BLUEPRINTS.map((b) => upsertBlueprint(b)));
  console.log(`  blueprints upserted: ${blueprints.length}`);

  let instances = 0;
  for (const orgId of orgIds) {
    for (const blueprint of blueprints) {
      await ensureInstance(orgId, blueprint);
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
