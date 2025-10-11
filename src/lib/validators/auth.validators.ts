/**
 * Authentication Validation Schemas
 * Zod schemas for validating authentication-related inputs
 */

import { z } from 'zod';

/**
 * Password validation schema
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least one special character'
  );

/**
 * Email validation schema
 * Normalizes email to lowercase and trims whitespace
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email is too long')
  .transform((email) => email.toLowerCase().trim());

/**
 * User role schema
 * Valid roles in the system
 */
export const roleSchema = z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER']);

/**
 * Self-registration role schema
 * Users cannot self-register as ADMIN
 */
export const selfRegisterRoleSchema = z.enum(['CREATOR', 'BRAND']);

/**
 * User registration schema
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, 'Name is required').max(255).optional(),
  role: selfRegisterRoleSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Login schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Email verification schema
 */
export const verifyEmailSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Password reset request schema
 */
export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;

/**
 * Password reset schema
 */
export const resetPasswordSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
  newPassword: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Profile update schema
 */
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatar: z.string().url().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Change password schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Resend verification email schema
 */
export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
