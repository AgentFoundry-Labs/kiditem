import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
