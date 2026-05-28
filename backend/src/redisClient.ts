import { Redis } from 'ioredis';

export const instanceId = process.env.INSTANCE_ID ?? `instance-${Math.random().toString(36).slice(2, 10)}`;

export type RedisClients = {
  publisher: Redis;
  subscriber: Redis;
};

export const createRedisClient = () => {
  const url = process.env.REDIS_URL;
  const options = {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    enableOfflineQueue: false,
  };

  if (url) return new Redis(url, options);

  const host = process.env.REDIS_HOST;
  if (!host) return null;

  return new Redis({
    ...options,
    host,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });
};

export const createRedisClients = async (): Promise<RedisClients | null> => {
  const publisher = createRedisClient();
  if (!publisher) return null;

  const subscriber = publisher.duplicate();

  try {
    await publisher.connect();
    await subscriber.connect();
    return { publisher, subscriber };
  } catch (error) {
    console.warn('Redis unavailable; continuing with single-instance Socket.IO mode');
    console.warn(error);
    publisher.disconnect();
    subscriber.disconnect();
    return null;
  }
};

export const pingRedis = async (client: Redis | null) => {
  if (!client || client.status !== 'ready') return 'disabled';
  try {
    await client.ping();
    return 'connected';
  } catch {
    return 'disconnected';
  }
};
