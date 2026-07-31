import { z } from 'zod';
import { zIsoDate } from './common.js';

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  type: z.string(),
  organizationId: z.string().uuid().nullable(),
  membershipId: z.string().uuid().nullable(),
});
export type AuthUserPublic = z.infer<typeof AuthUserPublicSchema>;

export const AuthSessionPublicSchema = z.object({
  token: z.string().min(43).max(43),
  expiresAt: zIsoDate,
});
export type AuthSessionPublic = z.infer<typeof AuthSessionPublicSchema>;

export const LoginResponseSchema = z.object({
  session: AuthSessionPublicSchema,
  user: AuthUserPublicSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Shared response envelope for HTTP 401 `auth_required`. Backend
// `GlobalExceptionFilter` and Next.js `proxy.ts` both emit this exact shape so
// `apiClient` can branch the same way regardless of which layer rejected the
// request. Field order mirrors backend filter output.
export type AuthRequiredErrorBody = {
  statusCode: 401;
  error: 'Unauthorized';
  message: 'auth_required';
  timestamp: string;
  path: string;
};
