import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly errors: unknown[] = [],
  ) {
    super(message);
  }
}

export const asyncHandler =
  <T extends Request>(handler: (request: T, response: Response, next: NextFunction) => Promise<unknown>) =>
  (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request as T, response, next)).catch(next);
  };

export const errorMiddleware = (error: unknown, request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      success: false,
      message: 'Invalid request',
      errors: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) logger.error({ error, path: request.path }, error.message);
    response.status(error.statusCode).json({ success: false, message: error.message, errors: error.errors });
    return;
  }

  logger.error({ error, path: request.path }, 'Unhandled API error');
  response.status(500).json({ success: false, message: 'Internal server error', errors: [] });
};
