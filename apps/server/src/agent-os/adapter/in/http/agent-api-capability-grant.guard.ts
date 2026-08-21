import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AGENT_API_CAPABILITY,
  AGENT_API_CAPABILITY_GRANT_PORT,
  type AgentApiCapability,
  type AgentApiCapabilityGrantPort,
  type AgentApiCapabilityPrincipal,
} from '../../../application/port/in/capability/agent-api-capability-grant.port';

export interface AgentApiCapabilityRequest extends Request {
  agentApiCapabilityPrincipal?: AgentApiCapabilityPrincipal;
}

@Injectable()
export class AgentApiCapabilityGrantGuard implements CanActivate {
  constructor(
    @Inject(AGENT_API_CAPABILITY_GRANT_PORT)
    private readonly grants: AgentApiCapabilityGrantPort,
    @Optional()
    private readonly capability: AgentApiCapability = AGENT_API_CAPABILITY,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentApiCapabilityRequest>();
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer ([^\s]+)$/.exec(authorization)
        : null;
    if (!match) {
      throw new UnauthorizedException('agent_api_capability_grant_invalid');
    }
    request.agentApiCapabilityPrincipal =
      await this.grants.verifyAndAuthorize({
        token: match[1]!,
        capability: this.capability,
      });
    return true;
  }
}
