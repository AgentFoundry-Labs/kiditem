import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const assetPathSchema = z.string().min(1).max(512);
const capabilityKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9]+)*$/);

const RuntimeAssetSchema = z
  .object({ path: assetPathSchema, sha256: sha256Schema })
  .strict();

export const AgentRuntimeManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    agentDefinitionKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    runtimeKind: z.enum(['coordinator', 'agent', 'tool_wrapper']),
    runtimeType: z.string().min(1).max(128),
    modelIdentity: z.string().min(1).max(256),
    capabilityKeys: z.array(capabilityKeySchema).max(100),
    policyDocument: z.record(z.string(), z.unknown()),
    delegation: z
      .object({
        role: z.enum(['orchestrator', 'leaf']),
        allowedAgentDefinitionKeys: z
          .array(z.string().regex(/^[a-z][a-z0-9_]*$/))
          .max(20),
        maxDepth: z.number().int().min(0).max(3),
        maxChildrenPerTask: z.number().int().min(0).max(20),
      })
      .strict(),
    limits: z
      .object({
        maxTurns: z.number().int().min(1).max(200),
        maxContextTokens: z.number().int().min(1_024),
        summaryTargetTokens: z.number().int().min(256),
      })
      .strict(),
    assets: z
      .object({
        prompt: RuntimeAssetSchema,
        summaryPrompt: RuntimeAssetSchema,
        skills: z.array(
          z
            .object({
              key: z.string().min(1).max(128),
              version: z.string().min(1).max(64),
              sha256: sha256Schema,
            })
            .strict(),
        ),
        outputSchema: z
          .object({
            path: assetPathSchema,
            version: z.string().min(1).max(128),
            sha256: sha256Schema,
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();

export type AgentRuntimeManifest = z.infer<typeof AgentRuntimeManifestSchema>;
export type AgentRuntimeManifestSource = z.input<
  typeof AgentRuntimeManifestSchema
>;

export interface AgentRuntimeManifestValidationCatalog {
  agentDefinitionKeys: readonly string[];
  runtimeTypes: readonly string[];
  capabilityKeys: readonly string[];
  skills: ReadonlyArray<{
    key: string;
    version: string;
    mode: 'development_workflow' | 'runtime_playbook';
  }>;
}

export interface CompiledAgentRuntimeManifest {
  manifest: AgentRuntimeManifest;
  manifestHash: string;
}

const FORBIDDEN_AUTHORITY_KEYS = new Set([
  'command',
  'executablePath',
  'hooks',
  'mcpServers',
  'pluginAuthority',
  'toolGrants',
  'tools',
]);
const SECRET_KEY_PATTERN = /(?:api.?key|password|secret|token)/i;

export function compileAgentRuntimeManifest(
  source: AgentRuntimeManifestSource,
  catalog: AgentRuntimeManifestValidationCatalog,
): CompiledAgentRuntimeManifest {
  const manifest = AgentRuntimeManifestSchema.parse(source);
  assertCatalogMembership(manifest, catalog);
  assertDelegation(manifest, catalog);
  assertAssetPath(manifest.assets.prompt.path);
  assertAssetPath(manifest.assets.summaryPrompt.path);
  if (manifest.assets.outputSchema) {
    assertAssetPath(manifest.assets.outputSchema.path);
  }
  assertNoDuplicates(manifest.capabilityKeys, 'capability');
  assertNoDuplicates(
    manifest.delegation.allowedAgentDefinitionKeys,
    'delegation target',
  );
  assertNoDuplicates(
    manifest.assets.skills.map((skill) => skill.key),
    'skill',
  );
  assertNoRuntimeAuthority(manifest.policyDocument);

  const canonicalJson = canonicalStringify(canonicalizeManifest(manifest));
  return {
    manifest,
    manifestHash: createHash('sha256').update(canonicalJson).digest('hex'),
  };
}

function assertCatalogMembership(
  manifest: AgentRuntimeManifest,
  catalog: AgentRuntimeManifestValidationCatalog,
): void {
  const definitions = new Set(catalog.agentDefinitionKeys);
  if (!definitions.has(manifest.agentDefinitionKey)) {
    throw new Error(
      `Unknown Agent definition: ${manifest.agentDefinitionKey}`,
    );
  }
  if (!new Set(catalog.runtimeTypes).has(manifest.runtimeType)) {
    throw new Error(`Unknown Agent runtime: ${manifest.runtimeType}`);
  }

  const capabilities = new Set(catalog.capabilityKeys);
  for (const capabilityKey of manifest.capabilityKeys) {
    if (!capabilities.has(capabilityKey)) {
      throw new Error(`Unknown Agent capability: ${capabilityKey}`);
    }
  }

  const skills = new Map(catalog.skills.map((skill) => [skill.key, skill]));
  for (const manifestSkill of manifest.assets.skills) {
    const registered = skills.get(manifestSkill.key);
    if (!registered) {
      throw new Error(`Unknown Agent runtime skill: ${manifestSkill.key}`);
    }
    if (registered.mode !== 'runtime_playbook') {
      throw new Error(
        `Development-only skill cannot be published: ${manifestSkill.key}`,
      );
    }
    if (registered.version !== manifestSkill.version) {
      throw new Error(
        `Agent runtime skill version mismatch: ${manifestSkill.key}`,
      );
    }
  }
}

function assertDelegation(
  manifest: AgentRuntimeManifest,
  catalog: AgentRuntimeManifestValidationCatalog,
): void {
  const { delegation } = manifest;
  if (delegation.role === 'leaf') {
    if (
      delegation.allowedAgentDefinitionKeys.length > 0 ||
      delegation.maxDepth !== 0 ||
      delegation.maxChildrenPerTask !== 0
    ) {
      throw new Error('Leaf Agents cannot publish delegation authority.');
    }
    return;
  }

  if (delegation.maxDepth < 1 || delegation.maxChildrenPerTask < 1) {
    throw new Error('Orchestrator delegation limits must be positive.');
  }
  const definitions = new Set(catalog.agentDefinitionKeys);
  for (const target of delegation.allowedAgentDefinitionKeys) {
    if (!definitions.has(target) || target === manifest.agentDefinitionKey) {
      throw new Error(`Unknown or unsafe Agent delegation target: ${target}`);
    }
  }
}

function assertAssetPath(path: string): void {
  if (
    path.includes('\\') ||
    path.startsWith('/') ||
    path.startsWith('~') ||
    !path.startsWith('agent-config/') ||
    posix.normalize(path) !== path ||
    path.split('/').includes('..')
  ) {
    throw new Error(`Runtime asset path is not code-owned: ${path}`);
  }
}

function assertNoDuplicates(values: readonly string[], kind: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate Agent ${kind}.`);
  }
}

function assertNoRuntimeAuthority(value: unknown, parentKey = ''): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoRuntimeAuthority(entry, parentKey));
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_KEYS.has(key) || SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Runtime manifest contains forbidden authority: ${key}`);
    }
    assertNoRuntimeAuthority(nested, key);
  }
}

function canonicalizeManifest(
  manifest: AgentRuntimeManifest,
): AgentRuntimeManifest {
  return {
    ...manifest,
    capabilityKeys: [...manifest.capabilityKeys].sort(),
    delegation: {
      ...manifest.delegation,
      allowedAgentDefinitionKeys: [
        ...manifest.delegation.allowedAgentDefinitionKeys,
      ].sort(),
    },
    assets: {
      ...manifest.assets,
      skills: [...manifest.assets.skills].sort((left, right) =>
        left.key.localeCompare(right.key) ||
        left.version.localeCompare(right.version),
      ),
    },
  };
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Manifest number must be finite.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${canonicalStringify(nested)}`,
      )
      .join(',')}}`;
  }
  throw new Error('Manifest contains a non-JSON value.');
}
