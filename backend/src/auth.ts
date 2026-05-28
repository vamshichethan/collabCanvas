import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';

export const authCookieName = 'collabcanvas_access';

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

const jwtSecret = () => process.env.JWT_SECRET || 'collabcanvas-dev-secret-change-me';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 1000 * 60 * 60 * 24 * 7,
});

export const toPublicUser = (user: { id: string; name: string; email: string | null; avatarUrl: string | null }): AuthUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatarUrl: user.avatarUrl,
});

export const validatePassword = (password: string) =>
  password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);

export const signToken = (user: AuthUser) =>
  jwt.sign({ sub: user.id, email: user.email, name: user.name }, jwtSecret(), { expiresIn: '7d' });

export const setAuthCookie = (response: Response, user: AuthUser) => {
  response.cookie(authCookieName, signToken(user), cookieOptions());
};

export const clearAuthCookie = (response: Response) => {
  response.clearCookie(authCookieName, { path: '/' });
};

export const getUserFromToken = async (token?: string) => {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret()) as { sub?: string };
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    return user ? toPublicUser(user) : null;
  } catch {
    return null;
  }
};

export const requireAuth = async (request: Request, response: Response, next: NextFunction) => {
  const user = await getUserFromToken(request.cookies?.[authCookieName]);
  if (!user) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }
  (request as AuthenticatedRequest).user = user;
  next();
};

export const createUser = async (input: { name: string; email: string; password: string }) => {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('A valid email is required');
  if (!input.name.trim()) throw new Error('Name is required');
  if (!validatePassword(input.password)) throw new Error('Password must be 8+ chars with uppercase, lowercase, and number');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email is already registered');

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: input.name.trim(),
      email,
      passwordHash,
    },
  });
  return toPublicUser(user);
};

export const loginUser = async (input: { email: string; password: string }) => {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) throw new Error('Invalid email or password');
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new Error('Invalid email or password');
  return toPublicUser(user);
};

export const parseCookies = (cookieHeader = '') =>
  Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split('=');
        return [key, decodeURIComponent(value.join('='))];
      }),
  );
