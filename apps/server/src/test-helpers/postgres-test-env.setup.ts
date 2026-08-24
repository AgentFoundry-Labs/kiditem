import { inject } from 'vitest';

const databaseUrl = inject('databaseUrl');
const runnerInstallationTokenFile = inject('runnerInstallationTokenFile');
process.env.DATABASE_URL = databaseUrl;
process.env.KIDITEM_AGENT_RUNNER_TOKEN_FILE = runnerInstallationTokenFile;
