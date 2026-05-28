import { Router } from 'express';
import { authCookieName, clearAuthCookie, createUser, getUserFromToken, loginUser, setAuthCookie } from './auth.js';

export const createAuthRoutes = () => {
  const router = Router();

  router.post('/signup', async (request, response) => {
    try {
      const user = await createUser(request.body ?? {});
      setAuthCookie(response, user);
      response.status(201).json({ user });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to sign up' });
    }
  });

  router.post('/login', async (request, response) => {
    try {
      const user = await loginUser(request.body ?? {});
      setAuthCookie(response, user);
      response.json({ user });
    } catch (error) {
      response.status(401).json({ error: error instanceof Error ? error.message : 'Unable to log in' });
    }
  });

  router.post('/logout', (_request, response) => {
    clearAuthCookie(response);
    response.json({ ok: true });
  });

  router.get('/me', async (request, response) => {
    const user = await getUserFromToken(request.cookies?.[authCookieName]);
    if (!user) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }
    response.json({ user });
  });

  return router;
};
