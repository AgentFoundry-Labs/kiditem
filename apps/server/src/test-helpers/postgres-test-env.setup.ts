import { inject } from 'vitest';

const databaseUrl = inject('databaseUrl');
const gatewayInstallationTokenFile = inject('gatewayInstallationTokenFile');
const webOrigin = inject('webOrigin');
process.env.DATABASE_URL = databaseUrl;
process.env.KIDITEM_AGENT_GATEWAY_TOKEN_FILE = gatewayInstallationTokenFile;
process.env.WEB_ORIGIN = webOrigin;
