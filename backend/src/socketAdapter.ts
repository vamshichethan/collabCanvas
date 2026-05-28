import { createAdapter } from '@socket.io/redis-adapter';
import type { Server } from 'socket.io';
import type { RedisClients } from './redisClient.js';

export const attachSocketAdapter = (io: Server, redis: RedisClients | null) => {
  if (!redis) return 'memory' as const;
  io.adapter(createAdapter(redis.publisher, redis.subscriber));
  return 'redis' as const;
};
