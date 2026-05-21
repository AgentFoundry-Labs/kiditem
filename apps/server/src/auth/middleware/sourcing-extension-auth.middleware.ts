import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  SOURCING_EXTENSION_TOKEN_PREFIX,
  SourcingExtensionTokenService,
} from '../sourcing-extension-token.service';

@Injectable()
export class SourcingExtensionAuthMiddleware implements NestMiddleware {
  constructor(private readonly tokens: SourcingExtensionTokenService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (req.authUser) return next();

    const bearer = extractBearerToken(req);
    if (!bearer?.startsWith(SOURCING_EXTENSION_TOKEN_PREFIX)) return next();

    try {
      const claims = this.tokens.verify(bearer);
      req.authUser = {
        id: claims.sub,
        organizationId: claims.organizationId,
        membershipId: claims.membershipId,
        role: claims.role,
        type: claims.type,
        email: claims.email,
      };
      req.sourcingExtensionToken = claims;
    } catch {
      // Let OrganizationScopeGuard return the same 401 envelope as other auth failures.
    }
    next();
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}
