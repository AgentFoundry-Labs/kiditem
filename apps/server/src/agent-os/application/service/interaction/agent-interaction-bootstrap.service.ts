import { Injectable } from '@nestjs/common';
import type { AguiRunIntent, InteractionBootstrap } from '@kiditem/shared/agent-interaction';
import type {
  AgentInteractionBootstrapPort,
  InteractionPrincipalInput,
  PrepareRunIntentInput,
} from '../../port/in/interaction/agent-interaction-bootstrap.port';
import { AgentInteractionAuthorizationService } from './agent-interaction-authorization.service';

/**
 * The bootstrap capability deliberately exposes only principal-safe discovery
 * and intent preparation. Authorization remains a separate input capability.
 */
@Injectable()
export class AgentInteractionBootstrapService implements AgentInteractionBootstrapPort {
  constructor(private readonly authorization: AgentInteractionAuthorizationService) {}

  bootstrap(input: InteractionPrincipalInput): Promise<InteractionBootstrap> {
    return this.authorization.bootstrap(input);
  }

  prepareRunIntent(input: PrepareRunIntentInput): Promise<AguiRunIntent> {
    return this.authorization.prepareRunIntent(input);
  }
}
