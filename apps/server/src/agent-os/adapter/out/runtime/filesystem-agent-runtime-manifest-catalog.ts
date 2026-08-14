import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { AgentRuntimeManifestCatalog } from '../../../application/service/agent-runtime-catalog-startup-validator.service';
import {
  compileAgentRuntimeManifest,
  type CompiledAgentRuntimeManifest,
} from '../../../domain/agent-runtime-manifest';
import {
  listAgentDefinitions,
} from '../../../domain/agent-definition.registry';
import { listAgentSkills } from '../../../domain/agent-skill.registry';
import type { AgentDefinitionRecord } from '../../../domain/agent-os.types';

const SUMMARY_PROMPT_PATH =
  'agent-config/prompts/system/session-summary.md';
export const CODE_OWNED_RUNTIME_TYPES = [
  'claude_cli',
  'claude_local',
  'codex_cli',
  'copilotkit_agui',
  'gemini_image',
  'hermes_http',
] as const;
const CODE_OWNED_CAPABILITY_KEYS = [
  'agent_os.platform_probe',
  'analytics.readOverview',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.inspectRecommendationRun',
  'sourcing.refreshCollection',
  'sourcing.refreshValidation',
  'sourcing.scrapeUrlWorkflow',
  'product_listing.create_generation_package',
  'product_listing.submit_wing_thumbnail',
  'supply.create_purchase_order_draft',
  'supply.submit_purchase_order',
  'channels.register_confirmed_listing',
  'channels.submit_coupang_listing',
] as const;
const DEFAULT_LIMITS = {
  maxTurns: 40,
  maxContextTokens: 32_000,
  summaryTargetTokens: 1_024,
} as const;

export interface CompiledAgentRuntimeCatalogVersion
  extends CompiledAgentRuntimeManifest {
  agentDefinitionKey: string;
  displayName: string;
  description: string;
}

export class FilesystemAgentRuntimeManifestCatalog
  implements AgentRuntimeManifestCatalog
{
  constructor(
    private readonly repositoryRoot: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async compileAll(): Promise<CompiledAgentRuntimeCatalogVersion[]> {
    const definitions = listAgentDefinitions();
    const skills = listAgentSkills();
    assertUnique(definitions.map((definition) => definition.type), 'definition');
    assertUnique(skills.map((skill) => skill.key), 'skill');

    const keys = definitions.map(canonicalDefinitionKey);
    const catalog = {
      agentDefinitionKeys: keys,
      runtimeTypes: CODE_OWNED_RUNTIME_TYPES,
      capabilityKeys: CODE_OWNED_CAPABILITY_KEYS,
      skills,
    };
    const targets = definitions
      .filter((definition) => definition.delegationRole === 'leaf')
      .map(canonicalDefinitionKey)
      .sort();
    const root = await realpath(this.repositoryRoot);
    const summaryPrompt = await readCodeOwned(root, SUMMARY_PROMPT_PATH);
    const summarySha256 = sha256(summaryPrompt);

    const compiled: CompiledAgentRuntimeCatalogVersion[] = [];
    for (const definition of definitions) {
      assertNoRuntimeSuppliedAuthority(definition);
      const modelIdentity = resolveModel(definition, this.env);
      const prompt = await readCodeOwned(root, definition.promptPath);
      const manifestSkills = await Promise.all(
        definition.defaultSkillKeys.map(async (key) => {
          const skill = skills.find((candidate) => candidate.key === key);
          if (!skill) throw new Error(`Unknown Agent runtime skill: ${key}`);
          if (skill.mode !== 'runtime_playbook') {
            throw new Error(`Development-only Agent runtime skill: ${key}`);
          }
          return {
            key: skill.key,
            version: skill.version,
            sha256: sha256(await readCodeOwned(root, skill.skillPath)),
          };
        }),
      );
      const outputSchema = definition.outputSchemaPath
        ? await compileOutputSchema(root, definition.outputSchemaPath)
        : null;
      const capabilityKeys = definition.defaultToolPolicies.map(
        (policy) => policy.toolKey,
      );
      const delegation = definition.delegationRole === 'orchestrator'
        ? {
            role: 'orchestrator' as const,
            allowedAgentDefinitionKeys: targets,
            maxDepth: 2,
            maxChildrenPerTask: 5,
          }
        : {
            role: 'leaf' as const,
            allowedAgentDefinitionKeys: [],
            maxDepth: 0,
            maxChildrenPerTask: 0,
          };
      const result = compileAgentRuntimeManifest(
        {
          schemaVersion: 1,
          agentDefinitionKey: canonicalDefinitionKey(definition),
          runtimeKind: definition.runtimeKind,
          runtimeType: runtimeType(definition),
          modelIdentity,
          capabilityKeys,
          policyDocument: {
            toolPolicies: definition.defaultToolPolicies,
          },
          delegation,
          limits: DEFAULT_LIMITS,
          assets: {
            prompt: {
              path: definition.promptPath,
              sha256: sha256(prompt),
            },
            summaryPrompt: {
              path: SUMMARY_PROMPT_PATH,
              sha256: summarySha256,
            },
            skills: manifestSkills,
            outputSchema,
          },
        },
        catalog,
      );
      compiled.push({
        agentDefinitionKey: canonicalDefinitionKey(definition),
        displayName: definition.name,
        description: definition.description ?? '',
        ...result,
      });
    }
    assertUnique(
      compiled.map((entry) => entry.manifestHash),
      'manifest hash',
    );
    return compiled;
  }
}

function assertNoRuntimeSuppliedAuthority(
  definition: AgentDefinitionRecord,
): void {
  if (Object.keys(definition.defaultCapabilities).length > 0) {
    throw new Error(
      `Runtime-supplied capability authority is forbidden: ${definition.type}`,
    );
  }
  const forbidden = /(?:command|executable|hook|mcp|plugin|toolGrant|tools)/i;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.test(key)) {
        throw new Error(
          `Runtime-supplied plugin authority is forbidden: ${definition.type}.${key}`,
        );
      }
      walk(nested);
    }
  };
  walk(definition.defaultRuntimeConfig);
}

function canonicalDefinitionKey(definition: AgentDefinitionRecord): string {
  return definition.type === 'manager' ? 'operator' : definition.type;
}

function runtimeType(definition: AgentDefinitionRecord): string {
  return definition.type === 'manager'
    ? 'copilotkit_agui'
    : definition.defaultAdapterType;
}

function resolveModel(
  definition: AgentDefinitionRecord,
  env: NodeJS.ProcessEnv,
): string {
  const specific = env[definition.defaultModelEnv]?.trim();
  const shared = env.AGENT_DEFAULT_MODEL?.trim();
  const value = specific || shared;
  if (!value) {
    throw new Error(
      `Missing Agent model: ${definition.defaultModelEnv} or AGENT_DEFAULT_MODEL`,
    );
  }
  return value;
}

async function compileOutputSchema(root: string, path: string) {
  const text = await readCodeOwned(root, path);
  let schema: unknown;
  try {
    schema = JSON.parse(text);
  } catch {
    throw new Error(`Invalid Agent output schema JSON: ${path}`);
  }
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error(`Invalid Agent output schema: ${path}`);
  }
  const version = (schema as Record<string, unknown>).$id;
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error(`Agent output schema requires a stable $id: ${path}`);
  }
  return { path, version, sha256: sha256(text) };
}

async function readCodeOwned(root: string, path: string): Promise<string> {
  if (
    isAbsolute(path) ||
    path.startsWith('~') ||
    path.includes('\\') ||
    !path.startsWith('agent-config/')
  ) {
    throw new Error(`Agent runtime asset is not code-owned: ${path}`);
  }
  const candidate = resolve(root, path);
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`Agent runtime asset escaped repository root: ${path}`);
  }
  const absolute = await realpath(candidate).catch(() => {
    throw new Error(`Agent runtime asset is missing: ${path}`);
  });
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Agent runtime asset escaped repository root: ${path}`);
  }
  return readFile(absolute, 'utf8').catch(() => {
    throw new Error(`Agent runtime asset is unreadable: ${path}`);
  });
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function assertUnique(values: readonly string[], type: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate Agent runtime ${type}.`);
  }
}
