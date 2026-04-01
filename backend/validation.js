import { z } from 'zod';

export const emailSchema = z.string().trim().email('Invalid email').transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200, 'Password is too long'),
});

export const createEmployeeSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/[0-9]/, 'Password must include a number'),
  name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long'),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(120, 'Name is too long').optional(),
    avatar_url: z.union([z.string().trim().url('avatar_url must be a valid URL'), z.literal('')]).optional(),
  })
  .refine((value) => value.name !== undefined || value.avatar_url !== undefined, {
    message: 'No changes provided',
  });

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required').max(120, 'Folder name is too long'),
  parent_id: z.coerce.number().int().positive().nullable().optional(),
});

export const folderVisibilitySchema = z.object({
  visibility: z.enum(['all', 'restricted']),
});

export const fileRenameSchema = z.object({
  original_name: z.string().trim().min(1, 'original_name is required').max(255, 'original_name is too long'),
});

export const folderAccessSchema = z.object({
  user_ids: z.array(z.coerce.number().int().positive()).max(1000).default([]),
});

export function parseOrThrow(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const err = new Error(issue?.message || 'Invalid request');
    err.statusCode = 400;
    throw err;
  }
  return result.data;
}
