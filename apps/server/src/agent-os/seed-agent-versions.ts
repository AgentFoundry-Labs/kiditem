import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from './domain/catalog/agent-version-publication.registry';
import { AgentVersionPublisher } from './application/service/work/agent-work-version-publisher.service';

/** The durable version snapshot excludes models, so require them at every seed. */
export function requireExplicitAgentVersionModels(environment: NodeJS.ProcessEnv = process.env): void {
  for (const definition of AGENT_VERSION_PUBLICATION_DEFINITIONS) {
    const key = `AGENT_${definition.agentDefinitionKey.toUpperCase()}_MODEL`;
    if (!environment[key]?.trim()) throw new Error(`missing_required_configuration:${key}`);
  }
}

/** Publish every shipped AgentVersion against the explicit Prisma v7 adapter. */
export async function seedAgentVersions(environment: NodeJS.ProcessEnv = process.env): Promise<number> {
  requireExplicitAgentVersionModels(environment);
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('missing_required_configuration:DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const publisher = new AgentVersionPublisher(prisma);
    const versions = await Promise.all(
      AGENT_VERSION_PUBLICATION_DEFINITIONS.map((definition) => publisher.publish(definition)),
    );
    return versions.length;
  } finally {
    await prisma.$disconnect();
  }
}
