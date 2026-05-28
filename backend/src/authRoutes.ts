import { Router } from 'express';
import { authCookieName, clearAuthCookie, createUser, getUserFromToken, loginUser, setAuthCookie } from './auth.js';
import { AppError, asyncHandler } from './errors.js';
import { logger } from './logger.js';
import { schemas, validateBody } from './validation.js';

export const createAuthRoutes = () => {
  const router = Router();

  router.post(
    '/signup',
    validateBody(schemas.signup),
    asyncHandler(async (request, response) => {
      try {
        const user = await createUser(request.body);
        setAuthCookie(response, user);
        response.status(201).json({ user });
      } catch (error) {
        logger.warn({ email: request.body?.email, error }, 'Signup failed');
        throw new AppError(error instanceof Error ? error.message : 'Unable to sign up', 400);
      }
    }),
  );

  router.post(
    '/login',
    validateBody(schemas.login),
    asyncHandler(async (request, response) => {
      try {
        const user = await loginUser(request.body);
        setAuthCookie(response, user);
        response.json({ user });
      } catch (error) {
        logger.warn({ email: request.body?.email }, 'Login failed');
        throw new AppError(error instanceof Error ? error.message : 'Unable to log in', 401);
      }
    }),
  );

  router.post('/logout', (_request, response) => {
    clearAuthCookie(response);
    response.json({ ok: true });
  });

  router.get('/me', asyncHandler(async (request, response) => {
    const user = await getUserFromToken(request.cookies?.[authCookieName]);
    if (!user) {
      throw new AppError('Authentication required', 401);
    }
    response.json({ user });
  }));

  return router;
};
