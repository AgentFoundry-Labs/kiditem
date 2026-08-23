import type { AgentVersionSeedingPort } from '../../port/in/work/agent-version-seeding.port';
import { seedAgentVersions } from '../../../seed-agent-versions';

/** Application input implementation used by the isolated production seed CLI. */
export class AgentVersionSeedingService implements AgentVersionSeedingPort {
  seed(): Promise<number> {
    return seedAgentVersions();
  }
}
