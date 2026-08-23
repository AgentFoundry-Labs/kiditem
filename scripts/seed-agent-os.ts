/**
 * Idempotently publish the six code-owned AgentVersion snapshots.
 *
 * Models are intentionally not persisted in an AgentVersion. Requiring every
 * model here makes a cutover fail closed before an operator starts the API.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { AGENT_VERSION_PUBLICATION_DEFINITIONS } from '../apps/server/src/agent-os/domain/catalog/agent-version-publication.registry';
import { seedAgentVersions } from '../apps/server/src/agent-os/seed-agent-versions';

config({ path: resolve(process.cwd(), 'apps/server/.env') });
config({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  // Keep the registry reference explicit for the script contract and execute
  // the same implementation the production image exposes as a Node CLI.
  if (AGENT_VERSION_PUBLICATION_DEFINITIONS.length !== 6) throw new Error('agent_version_publication_catalog_invalid');
  const count = await seedAgentVersions();
  console.log(`Published ${count} AgentVersions.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
