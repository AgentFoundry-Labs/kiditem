import type { CookieOptions, Response } from 'express';
import {
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_DURATION_MS,
} from '../application/auth.service';

export function authSessionCookieOptions(
  environment: NodeJS.ProcessEnv = process.env,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsWebOrigin(environment.WEB_ORIGIN),
    path: '/',
    maxAge: AUTH_SESSION_DURATION_MS,
  };
}

export function clearAuthSessionCookie(
  response: Pick<Response, 'clearCookie'>,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const { maxAge: _maxAge, ...options } = authSessionCookieOptions(environment);
  response.clearCookie(AUTH_SESSION_COOKIE, options);
}

function isHttpsWebOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
