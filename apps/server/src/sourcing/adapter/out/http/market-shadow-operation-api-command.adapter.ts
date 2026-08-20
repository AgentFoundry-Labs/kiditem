import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import type { MarketShadowOperationPort } from '../../../application/port/out/cross-domain/market-shadow-operation.port';

const CommandResponse = z
  .object({
    operationRunId: z.string().uuid(),
    status: z.string().min(1),
  })
  .strict();

type CommandEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  | 'KIDITEM_AGENT_OS_API_URL'
  | 'KIDITEM_AGENT_OS_API_CAPABILITY_GRANT'
>>;

@Injectable()
export class MarketShadowOperationApiCommandAdapter
  implements MarketShadowOperationPort
{
  constructor(
    @Optional()
    private readonly environment: CommandEnvironment = process.env,
    @Optional()
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async startShadowCollection(_input: {
    organizationId: string;
    requestedByUserId: string | null;
    triggerSource: 'domain_screen' | 'agent';
    idempotencyKey?: string | null;
  }): Promise<{ operationRunId: string; status: string }> {
    const apiUrl = this.apiUrl();
    const grant = this.environment.KIDITEM_AGENT_OS_API_CAPABILITY_GRANT?.trim();
    if (!grant) throw notConfigured();

    let response: Response;
    try {
      response = await this.fetcher(
        new URL(
          '/api/internal/agent-os/sourcing/shadow-collection',
          apiUrl,
        ).toString(),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${grant}`,
            'content-type': 'application/json',
          },
          body: '{}',
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch {
      throw commandFailed();
    }
    if (!response.ok) throw commandFailed();

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw commandFailed();
    }
    const parsed = CommandResponse.safeParse(body);
    if (!parsed.success) throw commandFailed();
    return parsed.data;
  }

  private apiUrl(): URL {
    const value = this.environment.KIDITEM_AGENT_OS_API_URL?.trim();
    if (!value) throw notConfigured();
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
      return url;
    } catch {
      throw notConfigured();
    }
  }
}

function notConfigured(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'market_shadow_operation_api_command_not_configured',
    'market_shadow_operation_api_command_not_configured',
  );
}

function commandFailed(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'market_shadow_operation_api_command_failed',
    'market_shadow_operation_api_command_failed',
  );
}
