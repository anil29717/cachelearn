import { z } from 'zod';
import { isSafeDisplayName, sanitizeDisplayName } from './utils/safeDisplay.js';

const displayNameSchema = (maxLen, label = 'Name') =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(maxLen, `${label} is too long`)
    .refine(isSafeDisplayName, {
      message: `${label} cannot contain HTML or script characters (<, >, &, tags)`,
    })
    .transform((s) => sanitizeDisplayName(s, maxLen));

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
  name: displayNameSchema(120, 'Name'),
});

export const updateProfileSchema = z
  .object({
    name: displayNameSchema(120, 'Name').optional(),
    avatar_url: z.union([z.string().trim().url('avatar_url must be a valid URL'), z.literal('')]).optional(),
  })
  .refine((value) => value.name !== undefined || value.avatar_url !== undefined, {
    message: 'No changes provided',
  });

const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required').max(200, 'Current password is too long'),
    new_password: strongPasswordSchema,
  })
  .refine((data) => data.new_password !== data.current_password, {
    message: 'New password must be different from your current password',
    path: ['new_password'],
  });

export const createFolderSchema = z.object({
  name: displayNameSchema(120, 'Folder name'),
  parent_id: z.coerce.number().int().positive().nullable().optional(),
});

export const folderVisibilitySchema = z.object({
  visibility: z.enum(['all', 'restricted']),
});

export const fileRenameSchema = z.object({
  original_name: displayNameSchema(255, 'File name'),
});

export const folderAccessSchema = z.object({
  user_ids: z.array(z.coerce.number().int().positive()).max(1000).default([]),
});

export const videoProgressUpdateSchema = z.object({
  watched_seconds: z.coerce.number().min(0).max(24 * 60 * 60),
  duration_seconds: z.coerce.number().min(0).max(24 * 60 * 60),
  last_position_seconds: z.coerce.number().min(0).max(24 * 60 * 60),
  /** Accumulated seconds of actual playback (small time deltas only); used to block seek-to-end completion. */
  engaged_watch_seconds: z.coerce.number().min(0).max(24 * 60 * 60),
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
