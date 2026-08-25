import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthService, AUTH_SESSION_COOKIE } from '../application/auth.service';
import { clearAuthSessionCookie } from './auth-session-cookie';
import { isAgentRuntimePrivateRequest } from '../../common/http/agent-runtime-route';

@Injectable()
export class SessionAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SessionAuthMiddleware.name);

  constructor(private readonly authService: AuthService) {}

  async use(request: Request, response: Response, next: NextFunction): Promise<void> {
    // This bearer belongs only to the process-memory execution binding registry.
    // It is never a browser session token and must not trigger a DB lookup.
    if (isAgentRuntimePrivateRequest(request)) {
      next();
      return;
    }
    if (request.authUser) {
      next();
      return;
    }
    const credential = extractSessionCredential(request);
    if (!credential) {
      next();
      return;
    }

    try {
      const authenticated = await this.authService.authenticateToken(credential.token);
      if (authenticated) {
        request.authUser = authenticated.authUser;
        request.authSessionId = authenticated.sessionId;
      } else if (credential.source === 'cookie') {
        clearAuthSessionCookie(response);
      }
    } catch (error) {
      this.logger.error('session lookup failed', error as Error);
    }
    next();
  }
}

function extractSessionCredential(
  request: Request,
): { token: string; source: 'bearer' | 'cookie' } | null {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    return token ? { token, source: 'bearer' } : null;
  }
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[AUTH_SESSION_COOKIE];
  return typeof token === 'string' && token
    ? { token, source: 'cookie' }
    : null;
}
