import type { AuthUser } from '../auth/auth.types';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthUser;
  }
}

export {};
