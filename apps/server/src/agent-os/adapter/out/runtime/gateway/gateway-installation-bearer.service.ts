import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

const INSTALLATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class GatewayInstallationUnauthorizedError extends Error {
  constructor() { super('gateway_installation_unauthorized'); }
}

export class GatewayInstallationUnavailableError extends Error {
  constructor() { super('gateway_installation_unavailable'); }
}

/** Dedicated bearer for the installed Gateway; it is never a browser session credential. */
export class GatewayInstallationBearerService {
  readonly installationId: string;
  private readonly token: Buffer | null;

  constructor(input: Readonly<{ token: string | null; installationId: string }>) {
    this.installationId = input.installationId;
    this.token = input.token && INSTALLATION_TOKEN.test(input.token) ? Buffer.from(input.token, 'utf8') : null;
  }

  require(headers: Readonly<{ authorization?: string | string[] | undefined }>): string {
    if (!this.token) throw new GatewayInstallationUnavailableError();
    const authorization = headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new GatewayInstallationUnauthorizedError();
    }
    const candidate = Buffer.from(authorization.slice('Bearer '.length).trim(), 'utf8');
    if (candidate.length !== this.token.length || !timingSafeEqual(candidate, this.token)) {
      throw new GatewayInstallationUnauthorizedError();
    }
    return this.installationId;
  }
}

/** Missing or unreadable Docker-secret material keeps the API up but Gateway ingress closed. */
export function gatewayInstallationBearerFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  read: (path: string, encoding: BufferEncoding) => string = readFileSync,
): GatewayInstallationBearerService {
  const tokenFile = environment.KIDITEM_AGENT_GATEWAY_TOKEN_FILE?.trim();
  let token: string | null = null;
  if (tokenFile) {
    try { token = read(tokenFile, 'utf8').trim(); }
    catch { token = null; }
  }
  const requestedInstallationId = environment.KIDITEM_AGENT_GATEWAY_INSTALLATION_ID?.trim();
  const installationId = requestedInstallationId && requestedInstallationId.length <= 200
    ? requestedInstallationId
    : 'gateway-installation';
  return new GatewayInstallationBearerService({ token, installationId });
}
