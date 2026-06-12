import { z } from 'zod';

export const SignupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export class SignupDto {
  name!: string;
  email!: string;
  password!: string;
  role?: 'USER' | 'ADMIN';
}

export class LoginDto {
  email!: string;
  password!: string;
}

export class RefreshTokenDto {
  refreshToken!: string;
}

export const UpdateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export class UpdateProfileDto {
  name!: string;
}

