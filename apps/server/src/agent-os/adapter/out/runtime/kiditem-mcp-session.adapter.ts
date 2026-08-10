import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AgentMcpSessionDescriptor,
  AgentMcpSessionPort,
} from '../../../application/port/out/runtime/agent-mcp-session.port';

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
    requestedByUserId: string | null;
  }): Promise<AgentMcpSessionDescriptor> {
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

    return {
      name: 'kiditem',
      command,
      args,
      env: {
        KIDITEM_AGENT_OS_ENV_ROOT: this.repositoryRoot,
        KIDITEM_AGENT_OS_ORGANIZATION_ID: input.organizationId,
        KIDITEM_AGENT_OS_CONVERSATION_ID: input.conversationId,
        KIDITEM_AGENT_OS_REQUEST_ID: input.requestId,
        KIDITEM_AGENT_OS_RUN_ID: input.runId,
        KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: input.agentInstanceId,
        KIDITEM_AGENT_OS_AGENT_TYPE: input.agentType,
        KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: input.requestedByUserId ?? '',
        ...kidItemAgentOsMcpChildEnvironment(),
      },
    };
  }
}
