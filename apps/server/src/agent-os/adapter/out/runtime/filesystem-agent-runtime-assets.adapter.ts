import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { findAgentSkillByKey } from '../../../domain/agent-skill.registry';
import type {
  AgentRuntimeAssetsPort,
  ResolveAgentRuntimeAssetsInput,
  ResolvedAgentRuntimeAssets,
} from '../../../application/port/out/runtime/agent-runtime-assets.port';

const OUTPUT_SCHEMA_VERSION = 'sourcing-agent-answer.v1' as const;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isContained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== '..' &&
      !isAbsolute(pathFromRoot))
  );
}

async function readContained(root: string, relativePath: string): Promise<string> {
  const candidate = resolve(root, relativePath);
  if (!isContained(root, candidate)) {
    throw new AgentOsRuntimeError(
      'runtime_asset_path_invalid',
      `Runtime asset must remain inside the repository: ${relativePath}`,
    );
  }

  let absolute: string;
  try {
    absolute = await realpath(candidate);
  } catch {
    throw new AgentOsRuntimeError(
      'runtime_asset_missing',
      `Runtime asset is missing: ${relativePath}`,
    );
  }
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new AgentOsRuntimeError(
      'runtime_asset_path_invalid',
      `Runtime asset must remain inside the repository: ${relativePath}`,
    );
  }

  try {
    return await readFile(absolute, 'utf8');
  } catch {
    throw new AgentOsRuntimeError(
      'runtime_asset_unreadable',
      `Runtime asset cannot be read: ${relativePath}`,
    );
  }
}

export class FilesystemAgentRuntimeAssetsAdapter
  implements AgentRuntimeAssetsPort
{
  constructor(
    private readonly repositoryRoot = resolve(
      __dirname,
      '../../../../../../..',
    ),
  ) {}

  async resolve(
    input: ResolveAgentRuntimeAssetsInput,
  ): Promise<ResolvedAgentRuntimeAssets> {
    const root = await realpath(this.repositoryRoot);
    const prompt = await readContained(root, input.promptPath);
    const skills = await Promise.all(
      input.skillKeys.map(async (key) => {
        const skill = findAgentSkillByKey(key);
        if (!skill) {
          throw new AgentOsRuntimeError(
            'runtime_asset_skill_unknown',
            `Unknown runtime skill: ${key}`,
          );
        }
        if (skill.mode !== 'runtime_playbook') {
          throw new AgentOsRuntimeError(
            'runtime_asset_skill_mode_invalid',
            `Skill is not a runtime playbook: ${key}`,
          );
        }
        if (!skill.allowedAgentTypes.includes(input.agentType)) {
          throw new AgentOsRuntimeError(
            'runtime_asset_skill_not_allowed',
            `Skill ${key} is not allowed for agent type ${input.agentType}`,
          );
        }
        const content = await readContained(root, skill.skillPath);
        return {
          key: skill.key,
          version: skill.version,
          path: skill.skillPath,
          content,
          sha256: sha256(content),
        };
      }),
    );
    const outputSchemaText = await readContained(root, input.outputSchemaPath);

    let outputSchema: unknown;
    try {
      outputSchema = JSON.parse(outputSchemaText);
    } catch {
      throw new AgentOsRuntimeError(
        'runtime_asset_schema_invalid',
        `Runtime output schema is malformed JSON: ${input.outputSchemaPath}`,
      );
    }
    if (
      typeof outputSchema !== 'object' ||
      outputSchema === null ||
      Array.isArray(outputSchema)
    ) {
      throw new AgentOsRuntimeError(
        'runtime_asset_schema_invalid',
        `Runtime output schema must be a JSON object: ${input.outputSchemaPath}`,
      );
    }
    if ((outputSchema as Record<string, unknown>).$id !== OUTPUT_SCHEMA_VERSION) {
      throw new AgentOsRuntimeError(
        'runtime_asset_schema_version_invalid',
        `Runtime output schema must use $id ${OUTPUT_SCHEMA_VERSION}: ${input.outputSchemaPath}`,
      );
    }

    return {
      promptPath: input.promptPath,
      prompt,
      promptSha256: sha256(prompt),
      skills,
      outputSchemaPath: input.outputSchemaPath,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      outputSchema: outputSchema as Record<string, unknown>,
      outputSchemaSha256: sha256(outputSchemaText),
    };
  }
}

export async function resolveAgentRuntimeAssetsFromFilesystem(
  input: ResolveAgentRuntimeAssetsInput & { repositoryRoot: string },
): Promise<ResolvedAgentRuntimeAssets> {
  return new FilesystemAgentRuntimeAssetsAdapter(input.repositoryRoot).resolve(
    input,
  );
}
