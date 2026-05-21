import type { AuthUser } from '../auth/auth.types';
import type { SourcingExtensionTokenClaims } from '../auth/sourcing-extension-token.service';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthUser;
    sourcingExtensionToken?: SourcingExtensionTokenClaims;
  }
}

export {};
