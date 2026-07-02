import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { modelFacingMcpToolNamesForAgentType } from '../../../application/service/kiditem-mcp-tool-registry.service';

const DEFAULT_HERMES_HOME = '/tmp/kiditem-agent-os-hermes';
const KIDITEM_AGENT_OS_TOOLSET = 'kiditem-agent-os';
const DEFAULT_TOOLSETS = ['skills'];
export interface HermesRuntimeProfile {
  hermesHome: string;
  configPath: string;
  toolsets: string[];
  env: Record<string, string>;
}

export interface PrepareHermesRuntimeProfileInput {
  organizationId: string;
  conversationId: string;
  requestId: string;
  runId: string | null;
  agentInstanceId: string;
  agentType: string;
  taskSessionId: string;
  requestedByUserId?: string | null;
  enableKidItemMcp?: boolean;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function kidItemMcpToolsetEnabled(): boolean {
  return process.env.AGENT_OS_HERMES_ENABLE_KIDITEM_MCP === 'true';
}

function configuredAuthHome(): string | null {
  return stringField(process.env.AGENT_OS_HERMES_AUTH_HOME);
}

function defaultToolsets(enableKidItemMcp: boolean): string[] {
  return enableKidItemMcp
    ? [KIDITEM_AGENT_OS_TOOLSET]
    : [...DEFAULT_TOOLSETS];
}

function buildProfileEnv(
  input: PrepareHermesRuntimeProfileInput,
  safeSegments: { organizationId: string; taskSessionId: string },
): Record<string, string> {
  const env: Record<string, string> = {
    KIDITEM_AGENT_OS_ORGANIZATION_ID: safeSegments.organizationId,
    KIDITEM_AGENT_OS_CONVERSATION_ID: input.conversationId,
    KIDITEM_AGENT_OS_TASK_SESSION_ID: safeSegments.taskSessionId,
    KIDITEM_AGENT_OS_REQUEST_ID: input.requestId,
    KIDITEM_AGENT_OS_RUN_ID: input.runId ?? '',
    KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: input.agentInstanceId,
    KIDITEM_AGENT_OS_AGENT_TYPE: input.agentType,
  };

  const requestedByUserId = stringField(input.requestedByUserId);
  if (requestedByUserId) {
    env.KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID = requestedByUserId;
  }

  return env;
}

function copyStringEnv(key: string, target: Record<string, string>): void {
  const value = stringField(process.env[key]);
  if (value) target[key] = value;
}

function buildMcpServerEnv(input: {
  profileEnv: Record<string, string>;
  baseHome: string;
  authHomeForNestedHermes: string | null;
  enabled: boolean;
}): Record<string, string> {
  const env = { ...input.profileEnv };
  if (!input.enabled) return env;

  copyStringEnv('AGENT_OS_OPERATOR_RUNTIME', env);
  copyStringEnv('AGENT_OS_HERMES_LEAF_AGENT_TYPES', env);
  copyStringEnv('AGENT_OS_HERMES_PROVIDER', env);
  copyStringEnv('AGENT_OS_HERMES_MODEL', env);
  copyStringEnv('AGENT_OS_HERMES_PATH', env);
  copyStringEnv('AGENT_OS_HERMES_TIMEOUT_MS', env);
  copyStringEnv('AGENT_OS_HERMES_MAX_OUTPUT_BYTES', env);
  copyStringEnv('AGENT_OS_HERMES_MAX_CONCURRENT_RUNS', env);
  env.AGENT_OS_HERMES_HOME = input.baseHome;
  if (input.authHomeForNestedHermes) {
    env.AGENT_OS_HERMES_AUTH_HOME = input.authHomeForNestedHermes;
  }

  return env;
}

function mcpServerEnvLines(profileEnv: Record<string, string>): string[] {
  const lines = ['    env:'];
  for (const [key, value] of Object.entries(profileEnv)) {
    lines.push(`      ${key}: ${yamlScalar(value)}`);
  }
  return lines;
}

function safePathSegment(value: unknown): string {
  const segment = stringField(value);
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('..') ||
    segment.includes('/') ||
    segment.includes('\\')
  ) {
    throw new AgentOsRuntimeError(
      'operator_runtime_invalid_profile_path',
      'Hermes runtime profile path segment is invalid.',
    );
  }

  return segment;
}

function buildKidItemMcpConfig(
  profileEnv: Record<string, string>,
  enabled: boolean,
  agentType: string,
): string {
  const command = 'node';
  const args = [
    join(__dirname, '../../in/mcp/kiditem-agent-os-mcp-server.js'),
  ];

  const lines = [
    'mcp_servers:',
    '  kiditem-agent-os:',
    `    command: ${yamlScalar(command)}`,
    '    args:',
    ...args.map((arg) => `      - ${yamlScalar(arg)}`),
    ...mcpServerEnvLines(profileEnv),
    `    enabled: ${enabled ? 'true' : 'false'}`,
    '    tools:',
    '      include:',
    ...modelFacingMcpToolNamesForAgentType(agentType).map(
      (tool) => `        - ${yamlScalar(tool)}`,
    ),
    '',
  ];

  return lines.join('\n');
}

async function copyAuthStoreIfConfigured(hermesHome: string): Promise<boolean> {
  const authHome = configuredAuthHome();
  if (!authHome) return false;

  const source = join(authHome, 'auth.json');
  const target = join(hermesHome, 'auth.json');
  const temp = `${target}.tmp`;

  try {
    await fs.copyFile(source, temp);
    await fs.chmod(temp, 0o600);
    await fs.rename(temp, target);
    return true;
  } catch (error) {
    try {
      await fs.rm(temp, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
    throw new AgentOsRuntimeError(
      'operator_runtime_auth_home_unavailable',
      'Hermes runtime auth home is configured but auth.json could not be copied.',
    );
  }
}

@Injectable()
export class HermesRuntimeProfileService {
  async prepare(
    input: PrepareHermesRuntimeProfileInput,
  ): Promise<HermesRuntimeProfile> {
    const baseHome =
      stringField(process.env.AGENT_OS_HERMES_HOME) ?? DEFAULT_HERMES_HOME;
    const organizationId = safePathSegment(input.organizationId);
    const taskSessionId = safePathSegment(input.taskSessionId);
    const hermesHome = join(
      baseHome,
      `org-${organizationId}`,
      `session-${taskSessionId}`,
    );
    const configPath = join(hermesHome, 'config.yaml');
    const profileEnv = buildProfileEnv(input, {
      organizationId,
      taskSessionId,
    });
    const enableKidItemMcp =
      input.enableKidItemMcp === true || kidItemMcpToolsetEnabled();

    await fs.mkdir(hermesHome, { recursive: true });
    const authCopied = await copyAuthStoreIfConfigured(hermesHome);
    const mcpServerEnv = buildMcpServerEnv({
      profileEnv,
      baseHome,
      authHomeForNestedHermes: authCopied ? hermesHome : null,
      enabled: enableKidItemMcp,
    });
    const configText = buildKidItemMcpConfig(
      mcpServerEnv,
      enableKidItemMcp,
      input.agentType,
    );
    await fs.writeFile(`${configPath}.tmp`, configText, 'utf8');
    await fs.rename(`${configPath}.tmp`, configPath);

    const env: Record<string, string> = {
      HERMES_HOME: hermesHome,
      ...profileEnv,
    };

    return {
      hermesHome,
      configPath,
      toolsets: defaultToolsets(enableKidItemMcp),
      env,
    };
  }
}
