import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { parseGatewayConfig } from './config.js';
import {
  NestControlClient,
  type NestControlPort,
} from './nest-control-client.js';
import { createInteractionGateway } from './runtime.js';

export async function checkGatewayReadiness(
  control: NestControlPort,
): Promise<{ readonly status: 'ok' }> {
  await Promise.all([
    control.checkInteractionHealth(),
    control.checkPrivateAguiHealth(),
  ]);
  return { status: 'ok' };
}

export function createGatewayListener(
  handler: (request: Request) => Promise<Response>,
  control: NestControlPort,
) {
  return async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    try {
      const url = new URL(
        incoming.url ?? '/',
        `http://${incoming.headers.host ?? 'localhost'}`,
      );
      if (url.pathname === '/health/live') {
        return sendJson(outgoing, 200, { status: 'ok' });
      }
      if (url.pathname === '/health/ready') {
        try {
          return sendJson(outgoing, 200, await checkGatewayReadiness(control));
        } catch {
          return sendJson(outgoing, 503, { status: 'unavailable' });
        }
      }

      const response = await handler(toFetchRequest(incoming, url));
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) =>
        outgoing.setHeader(name, value),
      );
      if (!response.body) return outgoing.end();
      Readable.fromWeb(response.body as never).pipe(outgoing);
    } catch {
      sendJson(outgoing, 500, { error: 'internal_error' });
    }
  };
}

function toFetchRequest(incoming: IncomingMessage, url: URL): Request {
  const method = incoming.method ?? 'GET';
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const canHaveBody = method !== 'GET' && method !== 'HEAD';
  const init: RequestInit & { duplex?: 'half' } = { method, headers };
  if (canHaveBody) {
    init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function start(): void {
  const config = parseGatewayConfig(process.env);
  const control = new NestControlClient({
    kidItemApiInternalUrl: config.kidItemApiInternalUrl,
    privateAguiUrl: config.agentOsAguiInternalUrl,
    serviceSecret: config.interactionGatewaySharedSecret,
  });
  const gateway = createInteractionGateway({
    control,
    privateAguiUrl: config.agentOsAguiInternalUrl,
    serviceSecret: config.interactionGatewaySharedSecret,
  });
  createServer(createGatewayListener(gateway.handler, control)).listen(
    config.port,
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) start();
