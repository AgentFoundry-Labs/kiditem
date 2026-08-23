import type { OnApplicationBootstrap } from '@nestjs/common';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from '../../../domain/catalog/agent-version-publication.registry';
import { AgentVersionPublisher } from './agent-work-version-publisher.service';

/** Publishes the code-owned six-version snapshot idempotently in every safe root. */
export class AgentVersionPublicationBootstrap implements OnApplicationBootstrap {
  constructor(private readonly publisher: Pick<AgentVersionPublisher, 'publish'>) {}

  async onApplicationBootstrap(): Promise<void> {
    await Promise.all(AGENT_VERSION_PUBLICATION_DEFINITIONS.map((definition) => this.publisher.publish(definition)));
  }
}
