import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserPublicSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid().nullable(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  type: z.string(),
});
export type AuthUserPublic = z.infer<typeof AuthUserPublicSchema>;
