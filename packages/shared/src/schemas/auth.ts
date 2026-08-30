import { z } from 'zod';

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

export const LoginResponseSchema = z.object({
  user: AuthUserPublicSchema,
}).strict();
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * Explicit browser-to-extension credential handoff. Browser API calls never
 * consume or persist this token; ordinary browser auth stays cookie-only.
 */
export const ExtensionAuthHandoffSchema = z.object({
  token: z.string().length(43),
}).strict();
export type ExtensionAuthHandoff = z.infer<typeof ExtensionAuthHandoffSchema>;

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
