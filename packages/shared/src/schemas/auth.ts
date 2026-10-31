// packages/shared/src/schemas/auth.ts
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(255).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(50).trim(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).trim().optional(),
});
