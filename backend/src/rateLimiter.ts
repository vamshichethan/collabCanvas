import type { Redis } from 'ioredis';

export type RateLimitBucket = 'cursor' | 'drawing' | 'chat' | 'ai' | 'export';

const limits: Record<RateLimitBucket, { max: number; windowSeconds: number }> = {
  cursor: { max: 20, windowSeconds: 1 },
  drawing: { max: 60, windowSeconds: 1 },
  chat: { max: 10, windowSeconds: 60 },
  ai: { max: 5, windowSeconds: 60 * 60 },
  export: { max: 20, windowSeconds: 60 },
};

export class RateLimiter {
  constructor(private readonly redis: Redis | null) {}

  async check(bucket: RateLimitBucket, userId: string) {
    const limit = limits[bucket];
    if (!this.redis || this.redis.status !== 'ready') return { allowed: true, remaining: limit.max };

    const window = Math.floor(Date.now() / (limit.windowSeconds * 1000));
    const key = `rate:${bucket}:${userId}:${window}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, limit.windowSeconds + 2);
    return {
      allowed: count <= limit.max,
      remaining: Math.max(limit.max - count, 0),
    };
  }
}
