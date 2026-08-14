import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AgentMcpSessionDescriptor,
  AgentMcpSessionPort,
} from '../../../application/port/out/runtime/agent-mcp-session.port';
import {
  AGENT_API_CAPABILITIES,
  AgentApiCapabilityGrantService,
} from '../../../application/service/agent-api-capability-grant.service';

const COMPILED_ENTRY =
  'apps/server/dist/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.js';
const TYPESCRIPT_ENTRY =
  'apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts';

export function kidItemAgentOsMcpChildEnvironment(): Record<string, string> {
  return {
    KIDITEM_AGENT_OS_MCP_CHILD: '1',
    AGENT_RUNTIME_WORKER_ENABLED: '0',
    OPERATION_RUNTIME_WORKER_ENABLED: '0',
    OPERATION_SCHEDULER_ENABLED: '0',
    AI_DIRECT_JOB_WORKER_ENABLED: '0',
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class KidItemMcpSessionAdapter implements AgentMcpSessionPort {
  constructor(
    private readonly grants: AgentApiCapabilityGrantService,
    @Optional()
    private readonly repositoryRoot = resolve(__dirname, '../../../../../../..'),
    @Optional()
    private readonly hostEnvironment: Readonly<NodeJS.ProcessEnv> = process.env,
  ) {}

  async prepare(input: {
    organizationId: string;
    conversationId: string;
    requestId: string;
    runId: string;
    agentInstanceId: string;
    agentType: string;
    playbookKey: string | null;
    planStepKey: string | null;
    requestedByUserId: string | null;
    homeDirectory: string;
  }): Promise<AgentMcpSessionDescriptor> {
    const apiUrl = resolveApiUrl(this.hostEnvironment.API_SELF_URL);
    const compiled = resolve(this.repositoryRoot, COMPILED_ENTRY);
    const typescript = resolve(this.repositoryRoot, TYPESCRIPT_ENTRY);
    let command = process.execPath;
    let args: string[];
    if (await exists(compiled)) {
      args = [compiled];
    } else if (
      this.hostEnvironment.NODE_ENV === 'development' &&
      (await exists(typescript))
    ) {
      command = 'npx';
      args = ['tsx', typescript];
    } else {
      throw new AgentOsRuntimeError(
        'mcp_entrypoint_missing',
        'KidItem Agent OS MCP entrypoint is not available.',
      );
    }

    const grant = this.grants.issue({
      organizationId: input.organizationId,
      requestId: input.requestId,
      runId: input.runId,
      agentInstanceId: input.agentInstanceId,
      capabilities: AGENT_API_CAPABILITIES,
    });
    return {
      name: 'kiditem',
      command,
      args,
      env: {
        HOME: input.homeDirectory,
        CODEX_HOME: input.homeDirectory,
        ANTHROPIC_API_KEY: '',
        CLAUDE_CODE_OAUTH_TOKEN: '',
        CODEX_API_KEY: '',
        OPENAI_API_KEY: '',
        KIDITEM_AGENT_OS_ENV_ROOT: this.repositoryRoot,
        KIDITEM_AGENT_OS_ORGANIZATION_ID: input.organizationId,
        KIDITEM_AGENT_OS_CONVERSATION_ID: input.conversationId,
        KIDITEM_AGENT_OS_REQUEST_ID: input.requestId,
        KIDITEM_AGENT_OS_RUN_ID: input.runId,
        KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: input.agentInstanceId,
        KIDITEM_AGENT_OS_AGENT_TYPE: input.agentType,
        KIDITEM_AGENT_OS_PLAYBOOK_KEY: input.playbookKey ?? '',
        KIDITEM_AGENT_OS_PLAN_STEP_KEY: input.planStepKey ?? '',
        KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: input.requestedByUserId ?? '',
        KIDITEM_AGENT_OS_API_URL: apiUrl,
        KIDITEM_AGENT_OS_API_CAPABILITY_GRANT: grant,
        ...kidItemAgentOsMcpChildEnvironment(),
      },
    };
  }
}

function resolveApiUrl(value: string | undefined): string {
  try {
    if (!value?.trim()) throw new Error('missing');
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported');
    }
    return url.origin;
  } catch {
    throw new AgentOsRuntimeError(
      'agent_api_url_invalid',
      'Agent API URL is missing or invalid.',
    );
  }
}
