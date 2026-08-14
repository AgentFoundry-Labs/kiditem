import { Injectable } from '@nestjs/common';
import {
  AGENT_API_SHADOW_COLLECTION_CAPABILITY,
  AgentApiCapabilityGrantService,
} from '../../../application/service/agent-api-capability-grant.service';
import { AgentApiCapabilityGrantGuard } from './agent-api-capability-grant.guard';

/** Exact guard for the sole Agent-to-API Shadow Operation command. */
@Injectable()
export class AgentApiShadowCapabilityGrantGuard extends AgentApiCapabilityGrantGuard {
  constructor(grants: AgentApiCapabilityGrantService) {
    super(grants, AGENT_API_SHADOW_COLLECTION_CAPABILITY);
  }
}
