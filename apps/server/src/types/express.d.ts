import type { AuthUser } from '../auth/auth.types';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthUser;
    authFailureReason?: 'auth_user_not_mirrored';
  }
}

export {};
