import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ZodError } from 'zod';
import { errorMiddleware } from '../errors.js';
import { schemas } from '../validation.js';

describe('validated API inputs', () => {
  it('has Supertest available for HTTP integration suites', () => {
    expect(typeof request).toBe('function');
  });

  it('accepts a normalized signup payload', () => {
    const payload = schemas.signup.parse({
      name: 'Vamshi',
      email: 'VAMSHI@example.com',
      password: 'Demo1234',
    });

    expect(payload.email).toBe('vamshi@example.com');
  });

  it('returns consistent validation errors', () => {
    const error = new ZodError([
      {
        code: 'custom',
        path: ['email'],
        message: 'Invalid email',
      },
    ]);
    const response = fakeResponse();

    errorMiddleware(error, { path: '/api/auth/signup' } as never, response as never, () => {});

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ success: false, message: 'Invalid request' });
  });

  it('limits chat messages', () => {
    expect(() => schemas.chatMessage.parse({ message: 'x'.repeat(2_001) })).toThrow();
  });
});

function fakeResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}
