import { Injectable } from '@nestjs/common';
import {
  AGENT_API_SHADOW_COLLECTION_CAPABILITY,
  type AgentApiCapabilityGrantPort,
} from '../../../application/port/in/capability/agent-api-capability-grant.port';
import { AgentApiCapabilityGrantGuard } from './agent-api-capability-grant.guard';

/** Exact guard for the sole Agent-to-API Shadow Operation command. */
@Injectable()
export class AgentApiShadowCapabilityGrantGuard extends AgentApiCapabilityGrantGuard {
  constructor(grants: AgentApiCapabilityGrantPort) {
    super(grants, AGENT_API_SHADOW_COLLECTION_CAPABILITY);
  }
}
