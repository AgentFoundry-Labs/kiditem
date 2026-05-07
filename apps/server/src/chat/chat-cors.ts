import type { Request, Response } from 'express';

interface ChatCorsEnv {
  NODE_ENV?: string;
  CORS_ORIGINS?: string;
}

const DEV_LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;
const DEFAULT_ALLOWED_HEADERS = 'authorization,content-type';
const ALLOWED_METHODS = 'GET,POST,OPTIONS';

function isAllowedChatOrigin(origin: string, env: ChatCorsEnv): boolean {
  if (env.NODE_ENV === 'production') {
    return (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .includes(origin);
  }

  return DEV_LOCALHOST_ORIGIN.test(origin);
}

export function applyChatCorsHeaders(
  req: Request,
  res: Response,
  env: ChatCorsEnv = process.env,
): void {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !isAllowedChatOrigin(origin, env)) {
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader(
    'Access-Control-Allow-Headers',
    typeof req.headers['access-control-request-headers'] === 'string'
      ? req.headers['access-control-request-headers']
      : DEFAULT_ALLOWED_HEADERS,
  );
  res.setHeader('Vary', 'Origin');
}

export function handleChatCorsPreflight(
  req: Request,
  res: Response,
  env: ChatCorsEnv = process.env,
): boolean {
  applyChatCorsHeaders(req, res, env);
  if (req.method.toUpperCase() !== 'OPTIONS') {
    return false;
  }

  res.status(204).end();
  return true;
}
