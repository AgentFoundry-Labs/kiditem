/**
 * Local/dev wrapper for the production Agent OS seed entrypoint.
 *
 * Usage:
 *   npx tsx scripts/seed-agent-os.ts
 *   AGENT_SEED_ORG_IDS=<uuid1>,<uuid2> npx tsx scripts/seed-agent-os.ts
 */
import { runAgentOsSeed } from '../apps/server/src/agent-os/seed-agent-os';

runAgentOsSeed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
