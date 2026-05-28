import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const roleSchema = z.enum(['OWNER', 'EDITOR', 'VIEWER']);
const visibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
const operationTypeSchema = z.enum(['CREATE', 'UPDATE', 'DELETE']);
const summaryTypeSchema = z.enum(['MEETING_NOTES', 'ACTION_ITEMS', 'CLASS_NOTES', 'MIND_MAP']);
const exportTypeSchema = z.enum(['PNG', 'PDF', 'JSON']);

const text = (max: number) => z.string().trim().min(1).max(max);

export const schemas = {
  signup: z.object({
    name: text(80),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(128),
  }),
  login: z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  }),
  createBoard: z.object({
    title: text(120).optional(),
    description: z.string().trim().max(500).optional(),
    visibility: visibilitySchema.optional(),
  }),
  updateBoard: z.object({
    title: text(120).optional(),
    pinned: z.boolean().optional(),
    thumbnailUrl: z.string().max(750_000).optional(),
  }),
  inviteSettings: z.object({
    inviteEnabled: z.boolean().optional(),
    inviteRole: roleSchema.exclude(['OWNER']).optional(),
    inviteExpiresAt: z.string().datetime().nullable().optional(),
    visibility: visibilitySchema.optional(),
  }),
  participantRole: z.object({ role: roleSchema }),
  aiSummary: z.object({ summaryType: summaryTypeSchema }),
  exportRecord: z.object({ exportType: exportTypeSchema }),
  chatMessage: z.object({ message: text(2_000) }),
  comment: z.object({
    objectId: z.string().trim().min(1).max(200).optional(),
    message: text(2_000),
  }),
  operation: z.object({
    opId: z.string().trim().min(1).max(200),
    roomId: z.string().trim().min(1).max(120),
    boardId: z.string().trim().min(1).max(120),
    objectId: z.string().trim().min(1).max(200),
    type: operationTypeSchema,
    payload: z.unknown().nullable(),
    previousPayload: z.unknown().nullable().optional(),
    userId: z.string().optional(),
    clientTimestamp: z.number().finite(),
  }),
};

export const validateBody =
  <T extends z.ZodTypeAny>(schema: T) =>
  (request: Request, _response: Response, next: NextFunction) => {
    request.body = schema.parse(request.body ?? {});
    next();
  };
