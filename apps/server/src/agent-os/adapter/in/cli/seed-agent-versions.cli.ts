import { seedAgentVersions } from '../../../seed-agent-versions';

void seedAgentVersions().then((count) => {
  console.log(`Published ${count} AgentVersions.`);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
