import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AGENT_API_CAPABILITY,
  AgentApiCapabilityGrantService,
  type AgentApiCapabilityPrincipal,
} from '../../../application/service/agent-api-capability-grant.service';

export interface AgentApiCapabilityRequest extends Request {
  agentApiCapabilityPrincipal?: AgentApiCapabilityPrincipal;
}

@Injectable()
export class AgentApiCapabilityGrantGuard implements CanActivate {
  constructor(private readonly grants: AgentApiCapabilityGrantService) {}

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
        capability: AGENT_API_CAPABILITY,
      });
    return true;
  }
}
